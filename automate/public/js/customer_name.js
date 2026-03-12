// ================= Utilities =================

const VALID_PREFIX = ['6', '7', '8', '9'];

function capitalizeWords(text) {
    if (!text) return text;

    const smallWords = ['a','an','the','and','but','or','for','nor','on','at','to','from','by','in','of','with'];

    return text
        .replace(/[^a-zA-Z0-9\s]/g, "")
        .split(" ")
        .filter(Boolean)
        .map(w => {
            const lower = w.toLowerCase();
            if (smallWords.includes(lower)) return lower;
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ");
}


function validateMobile(mobile) {

    if (!mobile) return true;

    let num = String(mobile).replace(/\D/g, '');

    if (num.length !== 10) {
        frappe.msgprint({
            title: "Invalid Mobile",
            indicator: "red",
            message: "Mobile number must be exactly 10 digits."
        });
        return false;
    }

    if (!VALID_PREFIX.includes(num[0])) {
        frappe.msgprint({
            title: "Invalid Mobile",
            indicator: "orange",
            message: "Mobile number must start with 6,7,8 or 9."
        });
        return false;
    }

    return num;
}


// ================= GST Sync =================

function sync_gstin_taxid(frm) {

    if (!frm.doc.gstin && !frm.doc.tax_id) return;

    if (frm.doc.gstin && !frm.doc.tax_id) {
        frm.set_value("tax_id", frm.doc.gstin);
        return;
    }

    if (frm.doc.tax_id && !frm.doc.gstin) {
        frm.set_value("gstin", frm.doc.tax_id);
        return;
    }

    if (frm.doc.gstin !== frm.doc.tax_id) {
        frm.set_value("tax_id", frm.doc.gstin);
    }
}



// ================= Address Automation =================

async function setDefaultAccounts(frm) {

    if (!frm.doc.customer_primary_address) return;

    let address = await frappe.db.get_doc(
        "Address",
        frm.doc.customer_primary_address
    );

    if (!address || address.country !== "India") return;

    let company = await frappe.db.get_value("Company", {}, "name");

    if (company.message && (!frm.doc.accounts || !frm.doc.accounts.length)) {

        let row = frm.add_child("accounts");
        row.company = company.message.name;

        let account = await frappe.db.get_list("Account", {
            filters: {
                company: row.company,
                account_type: "Receivable",
                root_type: "Asset",
                is_group: 0
            },
            fields: ["name"],
            limit: 1
        });

        if (account.length) {
            row.account = account[0].name;
        }

        frm.refresh_field("accounts");
    }

    let bank = await frappe.db.get_list("Bank Account", {
        filters: {
            company: address.company,
            is_default: 1,
            is_company_account: 1
        },
        fields: ["name"],
        limit: 1
    });

    if (bank.length) {
        frm.set_value("default_bank_account", bank[0].name);
    }
}



// ================= Automation Formatter =================

async function handleAutomation(frm, field, allowNumber = false) {

    if (!frm.doc.custom_automate) return;

    let enabled = await frappe.db.get_single_value(
        "Settings for Automation",
        "enable_customer_automation"
    );

    if (!enabled) return;

    let value = frm.doc[field];
    if (!value) return;

    let formatted = capitalizeWords(value);

    if (value !== formatted) {
        frm.set_value(field, formatted);
    }
}



// ================= Customer Events =================

frappe.ui.form.on("Customer", {

    onload(frm) {

        if (frm.is_new()) {
            frm.set_value("custom_automate", 1);
        }

        if (frm.doc.customer_type === "Individual") {
            frm.set_value("customer_group", "Individual");
        }
    },


    refresh(frm) {
        sync_gstin_taxid(frm);
    },


    validate(frm) {

        if (frm.doc.customer_type === "Individual") {

            let clean = validateMobile(frm.doc.custom_mobile);

            if (!clean) {
                frm.set_focus("custom_mobile");
                return false;
            }

            if (clean !== true) {
                frm.set_value("custom_mobile", clean);
            }
        }
    },


    customer_primary_address(frm) {
        setDefaultAccounts(frm);
    },


    customer_type(frm) {

        if (frm.doc.customer_type === "Individual") {
            frm.set_value("customer_group", "Individual");
        }

    },


    customer_name(frm) {
        handleAutomation(frm, "customer_name", true);
    },


    customer_details(frm) {
        handleAutomation(frm, "customer_details");
    },


    gstin(frm) {
        sync_gstin_taxid(frm);
    },


    tax_id(frm) {
        sync_gstin_taxid(frm);
    },


    default_currency(frm) {

        if (!frm.doc.default_currency) {
            frm.set_value("default_price_list", "");
            return;
        }

        frappe.call({
            method: "automate.customization.customer.get_price_list_from_currency",
            args: {
                party_type: "Supplier",
                currency: frm.doc.default_currency
            },
            callback: function (r) {

                if (r.message) {
                    frm.set_value("default_price_list", r.message);
                }
                else {
                    frappe.msgprint(
                        "No Price List configured for this currency"
                    );
                }

            }
        });

    },


    before_save(frm) {

        if (frm.doc.custom_automate) {
            frm.set_value("custom_automate", 0);
        }

    }

});