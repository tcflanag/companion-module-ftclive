import type ModuleInstance from './main.js'

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		setEvent: {
			name: 'Set Event ID',
			options: [
				{
					id: 'serverIP',
					type: 'textinput',
					label: 'Server IP',
					default: '',
					//regex: Regex.IP,
					useVariables: true,
				},
				{
					id: 'eventID',
					type: 'textinput',
					label: 'Event ID',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const { eventID, serverIP } = event.options
				if (typeof eventID !== 'string' || typeof serverIP !== 'string') {
					self.log('error', 'Event ID and server IP must be text values')
					return
				}

				self.config.event = eventID
				self.config.host = serverIP

				self.saveConfig.call(self, self.config, undefined)
				await self.init(self.config)
			},
		},
	})
}
