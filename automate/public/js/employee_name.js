// ===== Constants =====
const TEXT_FIELD_TYPES = ["Data", "Small Text", "Text", "Long Text", "Text Editor"];
const LOWERCASE_WORDS = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'in', 'of', 'with'];

// ===== Utility Objects =====
const FormHandler = {
    timeouts: {},
    lastValues: {},

    handle(frm, fieldname, automationField, formatFunction, realTimeFunction) {
        if (!frm.doc.custom_automate) return;
        const val = frm.doc[fieldname] || '';

        this.checkAutomation(automationField, (enabled) => {
            if (enabled) {
                const rtFormatted = realTimeFunction(val);
                if (val !== rtFormatted) {
                    frm.set_value(fieldname, rtFormatted);
                    return;
                }
            }
        });

        clearTimeout(this.timeouts[fieldname]);
        this.timeouts[fieldname] = setTimeout(() => {
            this.checkAutomation(automationField, (enabled) => {
                if (enabled) {
                    const valueToFormat = frm.doc[fieldname] || '';
                    if (this.lastValues[fieldname] === valueToFormat) return;
                    const formatted = formatFunction(valueToFormat);
                    this.lastValues[fieldname] = formatted;
                    if (valueToFormat !== formatted) frm.set_value(fieldname, formatted);
                }
            });
        }, 300);
    },

    cleanup(frm, fields) {
        Object.values(this.timeouts).forEach(clearTimeout);
        this.timeouts = {};
        fields.forEach(fieldname => {
            const value = frm.doc[fieldname];
            if (value) {
                const cleaned = value.replace(/[,\s]+$/, '').trim();
                if (value !== cleaned) frm.set_value(fieldname, cleaned);
            }
        });
    },

    checkAutomation(field, cb) {
        frappe.call({
            method: 'frappe.client.get_single_value',
            args: { doctype: 'Settings for Automation', field },
            callback: (res) => cb(!!res.message)
        });
    }
};

const TextFormatter = {
    realTime(text) {
        if (!text || text.endsWith(' ')) return text;
        return text.split(' ').map(word => {
            if (!word || word === word.toUpperCase()) return word;
            const lower = word.toLowerCase();
            return LOWERCASE_WORDS.includes(lower)
                ? lower
                : lower.charAt(0).toUpperCase() + lower.slice(1);
        }).join(' ');
    },
    full(text) {
        if (!text || text.endsWith(' ')) return text;
        return text
            .replace(/[^a-zA-Z\s]/g, '')
            .trim()
            .replace(/\s+/g, ' ')
            .replace(/[,\s]+$/, '')
            .replace(/\(/g, ' (')
            .split(' ')
            .filter(Boolean)
            .map(word => {
                if (word === word.toUpperCase()) return word;
                const lower = word.toLowerCase();
                return LOWERCASE_WORDS.includes(lower)
                    ? lower
                    : lower.charAt(0).toUpperCase() + lower.slice(1);
            }).join(' ');
    }
};

const EmailFormatter = {
    realTime: (email) => email ? email.toLowerCase() : email,
    full(email) {
        return (email || '')
            .toLowerCase()
            .replace(/[^a-z0-9@._\-]/g, '')
            .replace(/\s+/g, '')
            .replace(/@{2,}/g, '@')
            .trim();
    }
};

// ===== Helper Functions =====
function update_address_display(frm, source_field, target_display_field) {
    const address_name = frm.doc[source_field];
    if (!address_name) return frm.set_value(target_display_field, '');
    frappe.db.get_doc('Address', address_name)
        .then(address => {
            const parts = [
                address.address_line1,
                address.custom_post_office,
                address.custom_taluk,
                address.county,
                (address.city || '') + (address.state ? ', ' + address.state : ''),
                (address.country || '') + (address.pincode ? ' - ' + address.pincode : '')
            ];
            frm.set_value(target_display_field, parts.filter(Boolean).join('\n'));
        })
        .catch(() => frm.set_value(target_display_field, ''));
}

function update_employee_name(frm) {
    frm.set_value('employee_name', [frm.doc.first_name, frm.doc.middle_name, frm.doc.last_name].filter(Boolean).join(' '));
}

function addPrivateDictionary(original, corrected) {
    frappe.call({
        method: "validation.validation.doctype.private_dictionary.private_dictionary.add_to_dictionary",
        args: { original, corrected },
        callback: () => frappe.show_alert("Word added to Private Dictionary!")
    });
}

const textFields = [
    'first_name', 'middle_name', 'last_name',
    'family_background', 'health_details',
    'person_to_be_contacted', 'relation', 'bio'
];
const emailFields = ['personal_email', 'company_email'];

frappe.ui.form.on('Employee', {
    onload(frm) {
        if (frm.is_new()) frm.set_value('custom_automate', 1);
        frm._original_values = {};
    },

    refresh(frm) {
        check_employee_age(frm);
        frm._original_values = {};
        frm.meta.fields.forEach(f => {
            if (TEXT_FIELD_TYPES.includes(f.fieldtype))
                frm._original_values[f.fieldname] = frm.doc[f.fieldname];
        });
        if (frm.doc.custom_current_address) frm.trigger('custom_current_address');
        if (frm.doc.custom_permanent_address) frm.trigger('custom_permanent_address');
    },

    validate(frm) {
        frm._popup_shown_fields = frm._popup_shown_fields || {};
        let changes = [];
        frm.meta.fields.forEach(field => {
            if (!TEXT_FIELD_TYPES.includes(field.fieldtype)) return;
            const fieldname = field.fieldname;
            if (frm._popup_shown_fields[fieldname]) return;
            const old_val = frm._original_values[fieldname];
            const new_val = frm.doc[fieldname];
            if (old_val && new_val && old_val !== new_val) {
                const old_words = old_val.split(/\s+/);
                const new_words = new_val.split(/\s+/);
                old_words.forEach((word, idx) => {
                    if (new_words[idx] && word !== new_words[idx]) {
                        changes.push({ fieldname, original: word, corrected: new_words[idx] });
                    }
                });
            }
        });

        if (changes.length) {
            const { fieldname, original, corrected } = changes[0];
            frm._popup_shown_fields[fieldname] = true;
            frappe.confirm(
                `You corrected "<b>${original}</b>" to "<b>${corrected}</b>".<br><br>Do you want to add it to your Private Dictionary?`,
                () => addPrivateDictionary(original, corrected),
                () => frappe.show_alert("Skipped adding to dictionary.")
            );
        }
    },

    custom_current_address(frm) {
        update_address_display(frm, 'custom_current_address', 'custom_address_display');
    },
    custom_permanent_address(frm) {
        update_address_display(frm, 'custom_permanent_address', 'custom_permanent_address_display');
    },

    employee_number(frm) {
        if (frm.doc.custom_automate && frm.doc.employee_number) {
            frm.set_value('employee_number',
                frm.doc.employee_number.toUpperCase().replace(/[^A-Z0-9\-\/]/g, '').slice(0, 16)
            );
        }
    },

    before_save(frm) {
        FormHandler.cleanup(frm, textFields);
        if (frm.doc.custom_automate) frm.set_value('custom_automate', 0);
            if (address_popup_open) {
        return;
    }
    }
});

textFields.forEach(field => {
    frappe.ui.form.on('Employee', {
        [field](frm) {
            FormHandler.handle(frm, field, 'enable_employee_automation',
                TextFormatter.full, TextFormatter.realTime);
            if (['first_name', 'middle_name', 'last_name'].includes(field))
                setTimeout(() => update_employee_name(frm), 350);
        }
    });
});

emailFields.forEach(field => {
    frappe.ui.form.on('Employee', {
        [field](frm) {
            FormHandler.handle(frm, field, 'enable_employee_automation',
                EmailFormatter.full, EmailFormatter.realTime);
        }
    });
});


let address_popup_open = false;

frappe.ui.form.on("Employee", {

    custom_add_current_address(frm) {
        open_address_popup(frm, "current_address", true, "Current Address");
    },

    custom_add_permanent_address(frm) {
        open_address_popup(frm, "permanent_address", false, "Permanent Address");
    },

    date_of_birth(frm) {
        check_employee_age(frm);
    },

    before_save(frm) {

        // if (address_popup_open) {
        //     return;
        // }

    if (!frm.doc.current_address && !frm.doc.permanent_address) {

        frappe.validated = false;
        open_current_address_popup(frm);
        return;
    }

    if (frm.doc.current_address && !frm.doc.permanent_address) {

        frappe.validated = false;
        open_permanent_address_popup(frm);
        return;
    }

    }

});


/* ============================= */
/* BUTTON POPUP */
/* ============================= */

function open_address_popup(frm, fieldname, show_checkbox = true, address_type = "Current Address") {

    let d = get_address_dialog(show_checkbox, address_type);

    d.set_primary_action("Insert", async function (values) {

        let address = await format_india_address(values);

        frm.set_value(fieldname, address);

        if (values.same_address) {
            frm.set_value("permanent_address", address);
        }

        d.hide();

    });

    d.show();
}


/* ============================= */
/* CURRENT ADDRESS FLOW */
/* ============================= */

function open_current_address_popup(frm) {

    let d = get_address_dialog(true, "Current Address");

    d.set_primary_action("Insert",async function(values) {

         let address = await format_india_address(values);

        frm.set_value("current_address", address);

        d.hide();

        if (values.same_address) {

            frm.set_value("permanent_address", address);

            address_popup_open = false;

            frm.save();

        } else {

            address_popup_open = true;

            open_permanent_address_popup(frm);

        }

    });

    d.show();

}


/* ============================= */
/* PERMANENT ADDRESS FLOW */
/* ============================= */

function open_permanent_address_popup(frm) {

    let d = get_address_dialog(false, "Permanent Address");

    d.set_primary_action("Insert", async function(values) {

         let address = await format_india_address(values);

        frm.set_value("permanent_address", address);

        d.hide();

        address_popup_open = false;

        frm.save();

    });

    d.show();

}


/* ============================= */
/* DIALOG STRUCTURE */
/* ============================= */

function get_address_dialog(show_checkbox = true, address_type = "Current Address") {

    let fields = [

        { fieldtype: "Section Break" },

        {
            label: "Country",
            fieldname: "country",
            fieldtype: "Link",
            options: "Country",
            default: "India",
            reqd: 1
        },

        {
            label: "Postal Code",
            fieldname: "pincode",
            fieldtype: "Data",
            reqd: 1
        },

        {
            label: "Door, Building, Street",
            fieldname: "address_line1",
            fieldtype: "Data",
            reqd: 1
        },

        {
            label: "Landmark",
            fieldname: "address_line2",
            fieldtype: "Data",
            hidden: 1
        },

        {
            label: "City/Town",
            fieldname: "city",
            fieldtype: "Data",
            reqd: 1
        },

        { fieldtype: "Column Break" },

        {
            label: "Taluk",
            fieldname: "taluk",
            fieldtype: "Data"
        },

        {
            label: "Post Office",
            fieldname: "post_office",
            fieldtype: "Data"
        },

        {
            label: "District/County",
            fieldname: "county",
            fieldtype: "Data"
        },

        {
            label: "State/Province",
            fieldname: "state",
            fieldtype: "Data",
            reqd: 1
        }

    ];


    if (show_checkbox) {

        fields.push({ fieldtype: "Section Break" });

        fields.push({
            label: "Use same address in Permanent Address",
            fieldname: "same_address",
            fieldtype: "Check"
        });

    }


    let d = new frappe.ui.Dialog({

        title: `Add Address - ${address_type}`,
        size: "medium",
        fields: fields

    });


    /* ============================= */
    /* PINCODE API */
    /* ============================= */

    setTimeout(() => {

    // PINCODE EVENT
    d.fields_dict.pincode.$input.on("keyup", function () {

        let pincode = d.get_value("pincode");
        let country = d.get_value("country");

        if (!pincode || pincode.length !== 6 || country !== "India") return;

        frappe.call({

            method: "pin_mate.customization.address.get_post_offices_api",
            args: { pincode: pincode },

            callback(r) {

                let offices = r.message;

                if (!offices || !offices.length) {
                    frappe.msgprint("No Post Office Found");
                    return;
                }

                if (offices.length === 1) {

                    fill_address(d, offices[0]);

                } else {

                    let options = offices.map((o, i) => ({
                        label: o.post_office,
                        value: i
                    }));

                    let select_dialog = new frappe.ui.Dialog({

                        title: "Select Post Office",

                        fields: [{
                            fieldtype: "Select",
                            fieldname: "po",
                            label: "Post Office",
                            options: options
                        }],

                        primary_action_label: "Select",

                        primary_action(v) {

                            fill_address(d, offices[v.po]);
                            select_dialog.hide();

                        }

                    });

                    select_dialog.show();
                }

            }

        });

    });


    // ADDRESS SPLIT
    d.fields_dict.address_line1.$input.on("keyup", function () {

        let value = d.get_value("address_line1") || "";

        if (value.length > 40) {
            d.set_df_property("address_line2", "hidden", 0);
        } else {
            d.set_df_property("address_line2", "hidden", 1);
        }

    });

}, 300);

    return d;

}


/* ============================= */
/* AUTO FILL ADDRESS */
/* ============================= */

function fill_address(dialog, data) {

    dialog.set_value("post_office", data.post_office);
    dialog.set_value("taluk", data.taluk);
    dialog.set_value("state", data.state);
    dialog.set_value("county", data.district + " DT");

}


/* ============================= */
/* ADDRESS TEMPLATE RENDER */
/* ============================= */
async function format_india_address(v) {

    let r = await frappe.call({
        method: "pin_mate.customization.address.render_address_template",
        args: {
            values: v
        }
    });

    let address = r.message || "";

    // convert <br> to newline
    address = address.replace(/<br>/g, "\n");

    return address.trim();
}

/* ============================= */
/* AGE CALCULATION */
/* ============================= */

function check_employee_age(frm) {

    if (!frm.doc.date_of_birth) return;

    let dob = new Date(frm.doc.date_of_birth);
    let today = new Date();

    let years = today.getFullYear() - dob.getFullYear();
    let months = today.getMonth() - dob.getMonth();

    if (months < 0 || (months === 0 && today.getDate() < dob.getDate())) {
        years--;
    }

    frm.set_df_property("date_of_birth", "description", "");

    if (years < 18) {

        frm.set_value("custom_age", "");

        frm.set_df_property(
            "date_of_birth",
            "description",
            '<span style="color:red;font-weight:600;">Minor employee: Ensure compliance with Child Labour Act, 1986</span>'
        );

    }

    else {

        let total_months =
            (today.getFullYear() - dob.getFullYear()) * 12 +
            (today.getMonth() - dob.getMonth());

        let y = Math.floor(total_months / 12);
        let m = total_months % 12;

        frm.set_value("custom_age", `${y} Years ${m} Months`);

    }

}