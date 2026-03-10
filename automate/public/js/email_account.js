// ================== Global Utilities ==================
const FormHandler = {

    timeouts: new Map(),
    lastValues: new Map(),

    async isAutomationEnabled(field) {
        try {
            const { message } = await frappe.call({
                method: 'frappe.client.get_single_value',
                args: { doctype: 'Settings for Automation', field }
            });
            return !!message;
        } catch (error) {
            console.error('Automation check failed:', error);
            return false;
        }
    },

    getEditor(frm, fieldname) {
        return frm.fields_dict[fieldname]?.quill || null;
    },

    restoreCursor(editor, position) {
        if (!editor || position === null) return;

        setTimeout(() => {
            editor.setSelection(position);
        }, 0);
    },

    getCursor(editor) {
        if (!editor) return null;
        const range = editor.getSelection();
        return range ? range.index : null;
    },

    handle(frm, fieldname, automationField, formatFunction) {

        if (!frm.doc.custom_automate) return;

        const currentValue = frm.doc[fieldname] || '';

        if (this.lastValues.get(fieldname) === currentValue) return;

        if (this.timeouts.has(fieldname)) {
            clearTimeout(this.timeouts.get(fieldname));
        }

        this.timeouts.set(fieldname, setTimeout(async () => {

            const enabled = await this.isAutomationEnabled(automationField);
            if (!enabled) return;

            const valueToFormat = frm.doc[fieldname] || '';

            // IMPORTANT: do not format if trailing space exists
            if (valueToFormat.endsWith(' ')) return;

            const formatted = formatFunction(valueToFormat);

            if (!formatted || valueToFormat === formatted) return;

            this.lastValues.set(fieldname, formatted);

            const editor = this.getEditor(frm, fieldname);
            const cursor = this.getCursor(editor);

            frm.set_value(fieldname, formatted).then(() => {
                this.restoreCursor(editor, cursor);
            });

            setTimeout(() => {
                this.lastValues.delete(fieldname);
            }, 200);

        }, 300));
    },

    cleanup(frm, fields) {

        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout);
        }

        this.timeouts.clear();

        fields.forEach(fieldname => {

            const value = frm.doc[fieldname];
            if (!value) return;

            const stripped = value
                .replace(/<[^>]*>/g, ' ')
                .replace(/&nbsp;/gi, ' ')
                .replace(/\u00A0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const cleaned = stripped.replace(/[,\s]+$/, '').trim();

            if (value !== cleaned) {
                frm.set_value(fieldname, cleaned);
            }

        });

    }
};


// ================== Text Formatter ==================
const TextFormatter = {

    lowercaseWords: new Set([
        'a','an','the','and','but','or','for','nor',
        'on','at','to','from','by','in','of','with'
    ]),

    capitalizeWord(word) {
        const lower = word.toLowerCase();
        return this.lowercaseWords.has(lower)
            ? lower
            : lower.charAt(0).toUpperCase() + lower.slice(1);
    },

    full(text, allowNumbers=false) {

        if (!text) return text;

        if (/<[a-z][\s\S]*>/i.test(text)) {

            return text.replace(/>([^<]+)</g, (_, textNode) => {
                return `>${this._processPlainText(textNode, allowNumbers)}<`;
            });

        }

        return this._processPlainText(text, allowNumbers);
    },

    _processPlainText(text, allowNumbers) {

        if (!text) return text;

        const trailingSpace = /\s$/.test(text);

        const regex = allowNumbers
            ? /[^a-zA-Z0-9\s]/g
            : /[^a-zA-Z\s]/g;

        text = text
            .replace(/&nbsp;/gi, ' ')
            .replace(/\u00A0/g, ' ')
            .replace(regex,'')
            .replace(/\s+/g,' ')
            .replace(/^\s+/,'')
            .replace(/\(/g,' (');

        const result = text
            .split(' ')
            .filter(Boolean)
            .map(word =>
                word === word.toUpperCase()
                    ? word
                    : this.capitalizeWord(word)
            )
            .join(' ');

        return trailingSpace ? result + ' ' : result;
    }
};


// ================== Constants ==================
const EMAIL_ACCOUNT_CONSTANTS = {

    AUTOMATION_FIELDS: [
        'footer',
        'signature'
    ],

    AUTOMATION_SETTING_KEY: 'custom_email_account'
};


// ================== Form Events ==================
frappe.ui.form.on('Email Account', {

    onload(frm) {

        if (frm.is_new()) {
            frm.set_value('custom_automate', 1);
        }

    },

    refresh(frm) {

        console.log("Email Account Automation Loaded");

    },

    footer(frm) {

        FormHandler.handle(
            frm,
            'footer',
            EMAIL_ACCOUNT_CONSTANTS.AUTOMATION_SETTING_KEY,
            text => TextFormatter.full(text, false)
        );

    },

    signature(frm) {

        FormHandler.handle(
            frm,
            'signature',
            EMAIL_ACCOUNT_CONSTANTS.AUTOMATION_SETTING_KEY,
            text => TextFormatter.full(text, true)
        );

    },

    before_save(frm) {

        FormHandler.cleanup(
            frm,
            EMAIL_ACCOUNT_CONSTANTS.AUTOMATION_FIELDS
        );

        if (frm.doc.custom_automate) {
            frm.set_value('custom_automate', 0);
        }

    }

});