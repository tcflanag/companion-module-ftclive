import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { ModuleInstance } from './main.js'

export interface ModuleConfig {
	host: string
	port: number
	event: string
	title_format: string
}

export function GetConfigFields(self: ModuleInstance): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Server IP',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 80,
		},
		{
			type: 'dropdown',
			id: 'event',
			label: 'Event',
			default: '',
			width: 12,
			choices: [
				{
					id: '',
					label: 'Select an event',
				},
				...self.eventList.map((e) => ({
					id: e,
					label: e,
				})),
			],
		},
		{
			type: 'dropdown',
			id: 'title_format',
			label: 'Title Format',
			default: 'plain_num',
			
			choices: [
				{
					id: 'plain_num',
					label: 'Red:xxx,yyy Blue:aaa,bbb',
				},
				{
					id: 'color_num',
					label: '🔴:xxx,yyy 🔵:aaa,bbb',
				},
				{
					id: 'plain_name',
					label: 'Red: Name1,Name2 Blue:Name3,Name4',
				},
				{
					id: 'color_name',
					label: '🔴:Name1,Name2 🔵:Name3,Name4',
				},
				
			]
		},
	]
}
