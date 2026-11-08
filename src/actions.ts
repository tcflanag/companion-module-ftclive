import type { ModuleInstance } from './main.js'
//$(dataentry:entry_last)
//$(ftclive:eventList)[$(page:eventID)]
export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		setEvent: {
			name: 'Set Event ID',
			options: [
				{
					id: 'eventID',
					type: 'textinput',
					label: 'Event ID',
					default: "",
					useVariables: true, 
				},
				{
					id: 'serverIP',
					type: 'textinput',
					label: 'Server IP',
					default: "",
					//regex: Regex.IP,
					useVariables: true, 
				},
			],
			callback: (event) => {
		        
				self.config.event = String(event.options.eventID);
				self.config.host = String(event.options.serverIP);

				
				self.saveConfig.call(self, self.config, undefined);
				self.init(self.config)
				console.log(self.config)
			},
		},

	})
}
