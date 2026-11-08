import { InstanceBase,InstanceStatus, SomeCompanionConfigField      } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks } from './feedbacks.js'
import { APIV1Api, ApiV1Event, ApiV2UpdateType, createConfiguration, ServerConfiguration } from 'ftclive-client'
import { createFtcLiveWebSocketClient } from './ftclive-ws/client.js'

export async function checkServer(host: string, port: number): Promise<boolean> {
	try {
		const res = await fetch(`http://${host}:${port}/whoami/`, {
			signal: AbortSignal.timeout(1000),
		})
		const body = await res.text()
		return body == 'FIRST_TECH_CHALLENGE_SCORING_SOFTWARE'
	} catch (_) {
		return false
	}
}

export interface MyModuleTypes {
	config: ModuleConfig
	secrets: undefined
	actions: any
	feedbacks: any
	variables: any
}


export class ModuleInstance extends InstanceBase<MyModuleTypes> {
	config!: ModuleConfig // Setup in init()
	eventList: string[] = []
	apiClientV1?: APIV1Api
	timeouts: NodeJS.Timeout[] = []

	selectedEvents: ApiV1Event[] = []
	socketClients: Record<string, WebSocket> = {}
	connectionStatus: Record<string, boolean> = {}

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		console.log("Init",config)
		this.config = config
		console.log("a")
		void this.configUpdated(config)
		console.log("B")
		this.updateActions() // export actions
		console.log("C")
		this.updateFeedbacks() // export feedbacks
		console.log("D")
		this.updateVariableDefinitions() // export variable definitions
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		const isOk = await checkServer(config.host, config.port)
		if (!isOk) {
			this.updateStatus(InstanceStatus.BadConfig, 'Server not found or is not running FTCLive')
			return
		}
		this.apiClientV1 = new APIV1Api(
			createConfiguration({ baseServer: new ServerConfiguration(`http://${config.host}:${config.port}`, {}) }),
		)
		console.log("Connected")
		this.eventList = (await this.apiClientV1.getEvents()).eventCodes!
		this.updateVariableDefinitions() // Store the eventList immediately, so it's externally visible
		console.log("New list", this.eventList)
		if (this.config.event) {
			try {
				const eventCode = this.config.event
				let eventList: string[]
				if (eventCode.endsWith('_0')) {
					eventList = this.eventList
						.filter((e) => e.startsWith(eventCode.slice(0, -2)))
						.sort((a, b) => a.localeCompare(b))
				} else {
					eventList = [eventCode]
				}
				this.selectedEvents = await Promise.all(
					eventList.map(async (e) => {
						const res = await this.apiClientV1!.getEvent(e)
						const eventCode = res.eventCode!
						this.log('info', `Connected to event ${eventCode} (${res.name})`)
						return res
					}),
				)
				this.updateStatus(InstanceStatus.Connecting)
				this.updateVariableDefinitions()
				const eventCodes = this.selectedEvents.map((e) => e.eventCode!)
				Object.keys(this.socketClients).forEach((key) => {
					if (!eventCodes.includes(key)) {
						this.socketClients[key].close()
						delete this.socketClients[key]
						delete this.connectionStatus[key]
					}
				})
				this.selectedEvents.forEach((event) => {
					const eventCode = event.eventCode!
					if (!this.socketClients[eventCode]) {
						const varPrefix = event.division > 0 ? `d${event.division}_` : ''
						this.socketClients[eventCode] = createFtcLiveWebSocketClient(
							(level, message) => this.log(level, message),
							this.config.host,
							this.config.port,
							eventCode,
							(isConnected) => {
								this.connectionStatus[eventCode] = isConnected
								if (eventCodes.every((e) => this.connectionStatus[e])) {
									this.updateStatus(InstanceStatus.Ok)
								} else {
									this.updateStatus(InstanceStatus.Connecting)
								}
							},
							(update) => {
								this.log('debug', `Received update for event ${eventCode}: ${JSON.stringify(update)}`)
								if (update.init == true) {
									return;
								}
								switch (update.type) {
									case ApiV2UpdateType.ShowPreview:
										var title_text = "";
										console.log("format",this.config.title_format)
										if (this.config.title_format == 'plain_num'){
												title_text = `Red:${update.params?.red.teams[0].number},${update.params?.red.teams[1].number} Blue:${update.params?.blue.teams[0].number},${update.params?.blue.teams[1].number}`
												
											}
											else if (this.config.title_format == 'color_num'){
												title_text = `🔴:${update.params?.red.teams[0].number},${update.params?.red.teams[1].number} 🔵:${update.params?.blue.teams[0].number},${update.params?.blue.teams[1].number}`
												
											}
										this.setVariableValues({
											[`${varPrefix}f${update.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.field}_match_status`]: 'preview',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'preview',
											[`${varPrefix}match_title`]:title_text,
											[`${varPrefix}active_field`]:update.field
											
											
										})
										break
									case ApiV2UpdateType.ShowMatch:
										this.setVariableValues({
											[`${varPrefix}f${update.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.field}_match_status`]: 'prematch',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'prematch',
											[`${varPrefix}active_field`]:update.field
											
										})
										break
									case ApiV2UpdateType.MatchStart:
										// TODO timer variables maybe
										this.setVariableValues({
											[`${varPrefix}f${update.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.field}_match_status`]: 'run',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'run',
											[`${varPrefix}active_field`]:update.field
										})
										/*// Don't love the timing living here, but this works for the moment
										this.timeouts.push(
											setTimeout(
												() =>
													this.setVariableValues({
														[`${varPrefix}f${update.field}_match_status`]: 'transition',
														[`${varPrefix}match_status`]: 'transition',
													}),
												30 * 1000,
											),
										)
										this.timeouts.push(
											setTimeout(
												() =>
													this.setVariableValues({
														[`${varPrefix}f${update.field}_match_status`]: 'teleop',
														[`${varPrefix}match_status`]: 'teleop',
													}),
												(30 + 8) * 1000,
											),
										)
										this.timeouts.push(
											setTimeout(
												() =>
													this.setVariableValues({
														[`${varPrefix}f${update.field}_match_status`]: 'done',
														[`${varPrefix}match_status`]: 'done',
													}),
												(30 + 8 + 120) * 1000,
											),
										)*/
										break
									case ApiV2UpdateType.MatchAbort:
										this.timeouts.forEach((t) => clearTimeout(t))
										this.timeouts = []
										this.setVariableValues({
											[`${varPrefix}f${update.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.field}_match_status`]: 'aborted',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'aborted',
											[`${varPrefix}active_field`]:update.field
										})
										break
									case ApiV2UpdateType.MatchPost:
										this.setVariableValues({
											[`${varPrefix}f${update.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.field}_match_status`]: 'post',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'post',
											[`${varPrefix}active_field`]:update.field
										})
										break
								}
								
							},
						)
					}
					else {
						this.updateStatus(InstanceStatus.Ok)
					}
				})
			} catch (e) {
				this.log('error', `Failed configuring event: ${e}`)
				this.updateStatus(InstanceStatus.BadConfig, `Could not find event ${this.config.event}`)
			}
		} else {
			this.updateStatus(InstanceStatus.BadConfig, 'No event selected')
		}
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields(this)
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}
}


export default ModuleInstance;