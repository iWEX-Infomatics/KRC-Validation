import frappe


def set_supplier_tax_category_from_address(doc, method=None):

    links = frappe.get_all(
        "Dynamic Link",
        filters={
            "parent": doc.name,
            "link_doctype": "Supplier"
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
                "Supplier",
                link.link_name,
                update_data
            )


def set_inr_account_in_supplier(doc, method=None):

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
            "company": company,
            "is_group": 0,
            "name": ["like", "%Creditors%"]
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

        row.company = company
        row.account = inr_account


def set_supplier_defaults(doc, method=None):

    doc.default_currency = "INR"

    price_list = frappe.db.get_value(
        "Price List",
        {
            "buying": 1,
            "currency": "INR",
            "enabled": 1
        },
        "name"
    )

    if price_list:
        doc.default_price_list = price_list


def update_supplier_tax_category_from_address(doc, method=None):

    if not doc.tax_category:
        return

    links = frappe.get_all(
        "Dynamic Link",
        filters={
            "parent": doc.name,
            "link_doctype": "Supplier"
        },
        fields=["link_name"]
    )

    for link in links:

        frappe.db.set_value(
            "Supplier",
            link.link_name,
            "tax_category",
            doc.tax_category
        )