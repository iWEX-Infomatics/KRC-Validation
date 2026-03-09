import frappe

def set_inr_account_in_customer(doc, method=None):

    company = frappe.db.get_value(
        "Company",
        {"default_currency": "INR"},
        "name"
    )

    if not company:
        return

    # Always fetch Debtors account
    debtors_account = frappe.db.get_value(
        "Account",
        {
            "company": company,
            "is_group": 0,
            "name": ["like", "%Debtors%"]
        },
        "name"
    )

    if not debtors_account:
        return

    if not doc.accounts:
        row = doc.append("accounts", {})
        row.company = company
        row.account = debtors_account
        return

    for row in doc.accounts:
        row.company = company
        row.account = debtors_account


def set_customer_defaults(doc, method=None):

    doc.default_currency = "INR"

    price_list = frappe.db.get_value(
        "Price List",
        {
            "selling": 1,
            "currency": "INR",
            "enabled": 1
        },
        "name"
    )

    if price_list:
        doc.default_price_list = price_list