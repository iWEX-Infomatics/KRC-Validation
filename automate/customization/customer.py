import frappe

def update_customer_tax_category_from_address(doc, method=None):

    links = frappe.get_all(
        "Dynamic Link",
        filters={
            "parent": doc.name,
            "link_doctype": "Customer"
        },
        fields=["link_name"]
    )

    for link in links:

        update_data = {}

        if doc.tax_category:
            update_data["tax_category"] = doc.tax_category

        if doc.gstin:
            update_data["gstin"] = doc.gstin

        if update_data:
            frappe.db.set_value(
                "Customer",
                link.link_name,
                update_data
            )


def set_inr_account_in_customer(doc, method=None):

    company = frappe.db.get_value(
        "Company",
        {"default_currency": "INR"},
        "name"
    )

    if not company:
        return

    inr_account = frappe.db.get_value(
        "Account",
        {
            "account_currency": "INR",
            "company": company,
            "account_type": "Receivable",
            "is_group": 0
        },
        "name"
    )

    if not inr_account:
        return

    if not doc.accounts:
        row = doc.append("accounts", {})
        row.company = company
        row.account = inr_account
        return

    for row in doc.accounts:

        if not row.company:
            row.company = company

        if not row.account:
            row.account = inr_account


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