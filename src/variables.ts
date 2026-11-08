import { CompanionVariableDefinition } from '@companion-module/base'
import type { ModuleInstance } from './main.js'

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	console.log("Update",self.eventList)
	// 1. Change definitions from an array to a Record/Object dictionary
	const definitions: Record<string, CompanionVariableDefinition> = {}
	const values: Record<string, any> = {}
	
	definitions['eventList'] = {
		name: `Events on Score System`,
	};
	values['eventList'] = self.eventList; // 'as any' can be removed if types map matches
	
	definitions['ipaddress'] = {
		name: `IP Address`,
	};
	values['ipaddress'] = self.config.host;

	// Iterate through divisions
	self.selectedEvents.forEach((e) => {
		const isChild = e.division > 0
		
		const codeId = isChild ? `d${e.division}_code` : `code`
		definitions[codeId] = { name: isChild ? `Division Code` : `Event Code` }
		values[codeId] = e.eventCode

		const nameId = isChild ? `d${e.division}_name` : `name`
		definitions[nameId] = { name: isChild ? `Division Name` : `Event Name` }
		values[nameId] = e.name

		const matchNameId = isChild ? `d${e.division}_match_name` : `match_name`
		definitions[matchNameId] = { name: isChild ? `D${e.division} Current Match Name` : `Current Match Name` }

		const activeFieldId = isChild ? `d${e.division}_active_field` : `active_field`
		definitions[activeFieldId] = { name: isChild ? `D${e.division} Active Field` : `Active Field` }

		const matchStatusId = isChild ? `d${e.division}_match_status` : `match_status`
		definitions[matchStatusId] = { name: isChild ? `D${e.division} Match Status` : `Match Status` }

		const matchTitleId = isChild ? `d${e.division}_match_title` : `match_title`
		definitions[matchTitleId] = { name: isChild ? `D${e.division} Match Title` : `Match Title` }

		for (let i = 1; i <= e.fieldCount; i++) {
			const fMatchNameId = isChild ? `d${e.division}_f${i}_match_name` : `f${i}_match_name`
			definitions[fMatchNameId] = { name: isChild ? `D${e.division} Field ${i} Current Match Name` : `Field ${i} Current Match Name` }

			const fMatchStatusId = isChild ? `d${e.division}_f${i}_match_status` : `f${i}_match_status`
			definitions[fMatchStatusId] = { name: isChild ? `D${e.division} Field ${i} Match Status` : `Field ${i} Match Status` }
		}
	})

	// Safely invoke methods using explicit context handling
	self.setVariableDefinitions.call(self, definitions)
	self.setVariableValues.call(self, values)
}
