import { InstanceBase, runEntrypoint, InstanceStatus, SomeCompanionConfigField } from '@companion-module/base'
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

export class ModuleInstance extends InstanceBase<ModuleConfig> {
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
		this.config = config

		void this.configUpdated(config)
		console.log("AAAZ1")
		this.updateActions() // export actions
		console.log("AAAZ2")
		this.updateFeedbacks() // export feedbacks
		console.log("AAAZ3")
		this.updateVariableDefinitions() // export variable definitions
		console.log("AAAZ4")
	}
	// When module gets deleted
	async destroy(): Promise<void> {
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		console.log("AAA")
		const isOk = await checkServer(config.host, config.port)
		console.log("AAAB")
		if (!isOk) {
			this.updateStatus(InstanceStatus.BadConfig, 'Server not found or is not running FTCLive')
			return
		}
		console.log("AAAC")
		this.apiClientV1 = new APIV1Api(
			createConfiguration({ baseServer: new ServerConfiguration(`http://${config.host}:${config.port}`, {}) }),
		)
		console.log("AAAD")
		this.eventList = (await this.apiClientV1.getEvents()).eventCodes!
		console.log("AAAE")
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
				console.log("AAAF")
				this.updateStatus(InstanceStatus.Connecting)
				this.updateVariableDefinitions()
				console.log("AAAG")
				const eventCodes = this.selectedEvents.map((e) => e.eventCode!)
				console.log("AAAH")
				Object.keys(this.socketClients).forEach((key) => {
					if (!eventCodes.includes(key)) {
						this.socketClients[key].close()
						delete this.socketClients[key]
						delete this.connectionStatus[key]
					}
				})
				console.log("AAAY")
				this.selectedEvents.forEach((event) => {
					const eventCode = event.eventCode!
					if (!this.socketClients[eventCode]) {
						console.log("AAAY1")
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
								//console.log(update)
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
											[`${varPrefix}f${update.payload?.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.payload?.field}_match_status`]: 'preview',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'preview',
											[`${varPrefix}match_title`]:title_text
											
											
										})
										break
									case ApiV2UpdateType.ShowMatch:
										this.setVariableValues({
											[`${varPrefix}f${update.payload?.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.payload?.field}_match_status`]: 'prematch',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'prematch',
										})
										break
									case ApiV2UpdateType.MatchStart:
										// TODO timer variables maybe
										this.setVariableValues({
											[`${varPrefix}f${update.payload?.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.payload?.field}_match_status`]: 'auto',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'auto',
										})
										// Don't love the timing living here, but this works for the moment
										this.timeouts.push(
											setTimeout(
												() =>
													this.setVariableValues({
														[`${varPrefix}f${update.payload?.field}_match_status`]: 'transition',
														[`${varPrefix}match_status`]: 'transition',
													}),
												30 * 1000,
											),
										)
										this.timeouts.push(
											setTimeout(
												() =>
													this.setVariableValues({
														[`${varPrefix}f${update.payload?.field}_match_status`]: 'teleop',
														[`${varPrefix}match_status`]: 'teleop',
													}),
												(30 + 8) * 1000,
											),
										)
										this.timeouts.push(
											setTimeout(
												() =>
													this.setVariableValues({
														[`${varPrefix}f${update.payload?.field}_match_status`]: 'done',
														[`${varPrefix}match_status`]: 'done',
													}),
												(30 + 8 + 120) * 1000,
											),
										)
										break
									case ApiV2UpdateType.MatchAbort:
										this.timeouts.forEach((t) => clearTimeout(t))
										this.timeouts = []
										this.setVariableValues({
											[`${varPrefix}f${update.payload?.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.payload?.field}_match_status`]: 'aborted',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'aborted',
										})
										break
									case ApiV2UpdateType.MatchPost:
										this.setVariableValues({
											[`${varPrefix}f${update.payload?.field}_match_name`]: update.params?.matchName,
											[`${varPrefix}f${update.payload?.field}_match_status`]: 'post',
											[`${varPrefix}match_name`]: update.params?.matchName,
											[`${varPrefix}match_status`]: 'post',
										})
										break
								}
								this.log('debug', `Received update for event ${eventCode}: ${JSON.stringify(update)}`)
							},
						)
					}
					else {
						this.updateStatus(InstanceStatus.Ok)
					}
				})
				
				console.log("AAAZ")
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

runEntrypoint(ModuleInstance, UpgradeScripts)
