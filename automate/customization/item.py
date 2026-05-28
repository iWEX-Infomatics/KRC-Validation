import re
import frappe

def set_item_defaults(doc, method=None):

    if not doc.custom_is_item_default:
        return

    price_list = None
    expense_account = None
    income_account = None


    if doc.is_sales_item:
        price_list = "Standard Selling"

    elif doc.is_purchase_item:
        price_list = "Standard Buying"


    if doc.is_stock_item:
        expense_account = frappe.db.get_value(
            "Account",
            {"account_name": "Cost of Goods Sold", "is_group": 0},
            "name"
        )

        income_account = frappe.db.get_value(
            "Account",
            {"account_name": "Sales", "is_group": 0},
            "name"
        )

    else:
        service_account = frappe.db.get_value(
            "Account",
            {"account_name": "Service", "is_group": 0},
            "name"
        )

        expense_account = service_account
        income_account = service_account



    if not doc.item_defaults:
        row = doc.append("item_defaults", {})
        row.default_price_list = price_list
        row.expense_account = expense_account
        row.income_account = income_account
        return

    for row in doc.item_defaults:

        if price_list:
            row.default_price_list = price_list

        if expense_account:
            row.expense_account = expense_account

        if income_account:
            row.income_account = income_account



def set_tax_percentage_from_template(doc, method=None):

    if doc.custom_item_tax_percentage:
        return

    if not doc.taxes:
        return

    first_row = doc.taxes[0]

    template = first_row.item_tax_template or ""

    match = re.search(r"GST\s+(\d+%)", template)

    if not match:
        return

    percentage = match.group(1)

    if percentage not in ["5%", "12%", "18%", "28%"]:
        return

    doc.custom_item_tax_percentage = percentage

    categories = [
        "In-State",
        "Out-State",
        "Reverse Charge In-State",
        "Reverse Charge Out-State"
    ]

    doc.set("taxes", [])

    for category in categories:
        doc.append("taxes", {
            "item_tax_template": template,
            "tax_category": category
        })
    



