import frappe


def set_inr_account_in_customer(doc, method=None):

    company = frappe.db.get_value(
        "Company",
        {"default_currency": "INR"},
        "name"
    )

    if not company:
        return

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

    # Accounts child table
    if not doc.accounts:
        row = doc.append("accounts", {})
        row.company = company
        row.account = debtors_account
    else:
        for row in doc.accounts:
            row.company = company
            row.account = debtors_account

    # Credit Limits child table
    if not doc.credit_limits:
        row = doc.append("credit_limits", {})
        row.company = company
    else:
        for row in doc.credit_limits:
            row.company = company



def set_customer_defaults(doc, method=None):

    if not doc.default_currency:
        doc.default_currency = "INR"

    if not doc.default_price_list and doc.default_currency == "INR":

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

    if doc.default_currency and doc.default_currency != "INR":

        custom_price_list = frappe.db.get_value(
            "Price List Setting",
            {
                "parent": "Settings for Automation",
                "party_type": "Customer",
                "currency": doc.default_currency
            },
            "price_list"
        )

        if not custom_price_list:
            frappe.throw(
                f"No Price List configured for Customer with currency <b>{doc.default_currency}</b> in Settings for Automation."
            )

        doc.default_price_list = custom_price_list
    

@frappe.whitelist()
def get_price_list_from_currency(party_type, currency):

    price_list = frappe.db.get_value(
        "Price List Setting",
        {
            "parent": "Settings for Automation",
            "party_type": party_type,
            "currency": currency
        },
        "price_list"
    )

    return price_list