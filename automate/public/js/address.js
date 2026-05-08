// ================= Address Capitalization Automation =================

const AddressFormHandler = {
    timeouts: {},
    lastValues: {}
};


function capitalizeWords(text, allow_address_chars = false) {

    if (!text) return text;

    const smallWords = [
        'a', 'an', 'the', 'and', 'but', 'or',
        'for', 'nor', 'on', 'at', 'to',
        'from', 'by', 'in', 'of', 'with'
    ];

    if (allow_address_chars) {

        text = text
            .replace(/[^a-zA-Z0-9\s,#-]/g, "")

            // prevent repeated special chars
            .replace(/,{2,}/g, ",")
            .replace(/#{2,}/g, "#")
            .replace(/-{2,}/g, "-");
    } else {
        text = text.replace(/[^a-zA-Z0-9\s]/g, "");
    }

    return text
        .split(" ")
        .filter(Boolean)
        .map(w => {

            const lower = w.toLowerCase();

            if (smallWords.includes(lower)) {
                return lower;
            }

            return lower.charAt(0).toUpperCase() + lower.slice(1);

        })
        .join(" ");
}


async function handleAddressAutomation(frm, field) {

    // Address form checkbox must be checked
    if (cint(frm.doc.custom_automate) !== 1) {
        return;
    }

    // Global settings checkbox must be checked
    let enabled = await frappe.db.get_single_value(
        "Settings for Automation",
        "enable_address_automation"
    );

    if (cint(enabled) !== 1) {
        return;
    }

    clearTimeout(AddressFormHandler.timeouts[field]);

    AddressFormHandler.timeouts[field] = setTimeout(() => {

        const value = frm.doc[field];

        if (!value) return;

        if (value.endsWith(' ')) return;

        if (AddressFormHandler.lastValues[field] === value) return;

        const formatted = capitalizeWords(
            value,
            ["address_line1", "address_line2"].includes(field)
        );

        AddressFormHandler.lastValues[field] = formatted;

        if (formatted !== value) {
            frm.set_value(field, formatted);
        }

    }, 300);
}



frappe.ui.form.on("Address", {

    onload(frm) {

        if (frm.is_new()) {
            frm.set_value("custom_automate", 1);
        }

    },


    address_line1(frm) {
        handleAddressAutomation(frm, "address_line1");
    },


    address_line2(frm) {
        handleAddressAutomation(frm, "address_line2");
    },


    city(frm) {
        handleAddressAutomation(frm, "city");
    },


    before_save(frm) {

        Object.values(AddressFormHandler.timeouts).forEach(clearTimeout);

        ['address_line1', 'address_line2', 'city'].forEach(field => {

            const val = frm.doc[field];

            if (!val) return;

            const cleaned = val.replace(/[,\s]+$/, '').trim();

            if (cleaned !== val) {
                frm.set_value(field, cleaned);
            }

        });

        // Disable automation after first save
        if (frm.doc.custom_automate) {
            frm.set_value("custom_automate", 0);
        }

    }

});