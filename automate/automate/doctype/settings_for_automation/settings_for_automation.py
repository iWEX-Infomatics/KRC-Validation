# Copyright (c) 2026, madhu@yopmail.com and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class SettingsforAutomation(Document):
	pass

@frappe.whitelist()
def get_automation_setting(field):
    settings = frappe.get_cached_doc("Settings for Automation")
    return settings.get(field)