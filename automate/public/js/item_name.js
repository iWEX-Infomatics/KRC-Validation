// ─────────────────────────────────────────────
//  Settings Cache — single fetch, reused always
// ─────────────────────────────────────────────
const AutomationSettings = {
    _cache: null,
    _fetching: false,
    _queue: [],

    get(callback) {
        if (this._cache) return callback(this._cache);

        this._queue.push(callback);
        if (this._fetching) return;

        this._fetching = true;
        frappe.call({
            method: 'frappe.client.get',
            args: { doctype: 'Settings for Automation', name: 'Settings for Automation' },
            callback: (res) => {
                this._cache = res.message ? {
                    enable_item_automation:  res.message.enable_item_automation  || 0,
                    item_code_automation:    res.message.item_code_automation    || 0,
                    item_name_automation:    res.message.item_name_automation    || 0,
                    description_automation:  res.message.description_automation  || 0,
                } : {
                    enable_item_automation: 0, item_code_automation: 0,
                    item_name_automation: 0,   description_automation: 0,
                };

                // TTL: 60 seconds — stale cache auto-clear
                setTimeout(() => { this._cache = null; }, 60000);

                this._fetching = false;
                this._queue.forEach(cb => cb(this._cache));
                this._queue = [];
            }
        });
    },

    // Call this if settings change mid-session
    invalidate() { this._cache = null; }
};

// ─────────────────────────────────────────────
//  Text Formatter
// ─────────────────────────────────────────────
const ItemTextFormatter = {
    // Words to keep lowercase — only for item_code / description (NOT item_name)
    lowercaseWords: new Set(['a','an','the','and','but','or','for','nor','on','at','to','from','by','in','of','with']),

    _capitalize(word, keepOriginalCase) {
        if (!word) return word;
        const rest = keepOriginalCase ? word.slice(1) : word.slice(1).toLowerCase();
        return word.charAt(0).toUpperCase() + rest;
    },

    /**
     * realTime — called on every keystroke.
     * Does NOT touch the last word while user is still typing (no trailing-space yet).
     * isItemName=true → every word Title-Cased (no lowercase exceptions)
     * isItemName=false → standard title-case with lowercaseWords exceptions
     */
realTime(text, isItemName = false) {
    if (!text) return text;

    const trailingSpaces = text.match(/\s+$/)?.[0] || '';

    const words = text.split(' ');
    const lastIdx = words.length - 1;

    const formatted = words.map((word, idx) => {
        if (!word) return word;
        if (idx === lastIdx && !text.endsWith(' ')) return word;
        return this._formatWord(word, idx, isItemName);
    }).join(' ');

    return formatted + trailingSpaces; 
},

    /**
     * full — called after debounce (user paused / field blur).
     * Strips invalid chars, collapses spaces, then formats all words.
     */
    full(text, isItemName = false) {
        if (!text) return text;

        // Strip invalid chars
        let out = isItemName
            ? text.replace(/[^a-zA-Z0-9\s\-_]/g, '')
            : text.replace(/[^a-zA-Z0-9\s\-]/g, '');

        out = out
            .trim()
            .replace(/\s+/g, ' ')           // collapse spaces
            .replace(/[,\s]+$/, '')          // trailing comma/space
            .replace(/\s*\(\s*/g, ' (');     // normalise opening paren spacing

        return out
            .split(' ')
            .filter(Boolean)
            .map((word, idx) => this._formatWord(word, idx, isItemName))
            .join(' ');
    },

    _formatWord(word, index, isItemName) {
        if (!word) return word;

        // ALL-CAPS abbreviations — preserve (only for non-item-name fields)
        if (!isItemName && word === word.toUpperCase() && word.length > 1) return word;

        const lower = word.toLowerCase();

        if (isItemName) {
            // item_name: capitalize every word, no exceptions
            return this._capitalize(word, false);
        }

        // item_code / description: keep articles/prepositions lowercase except at start
        if (index !== 0 && this.lowercaseWords.has(lower)) return lower;

        return this._capitalize(word, false);
    }
};

// ─────────────────────────────────────────────
//  Form Handler
// ─────────────────────────────────────────────
const FormHandler = {
    timeouts:    {},
    lastValues:  {},

    /**
     * Unified field handler.
     * settingKey: the automation flag in Settings for Automation that DISABLES formatting.
     */
handleItemField(frm, fieldname, settingKey, formatFn, realTimeFn) {
    if (!frm.doc.custom_automate) return;


    clearTimeout(this.timeouts[fieldname]);
    this.timeouts[fieldname] = setTimeout(() => {
        AutomationSettings.get((s) => {
            if (!s.enable_item_automation || s[settingKey]) return;

            const value = frm.doc[fieldname] || '';
            if (this.lastValues[fieldname] === value) return;

            if (value.endsWith(' ')) return;

            const formatted = formatFn(value);
            this.lastValues[fieldname] = formatted;
            if (formatted !== value) frm.set_value(fieldname, formatted);
        });
    }, 300);
},
    cleanup(frm, fields) {
        Object.values(this.timeouts).forEach(clearTimeout);
        this.timeouts = {};

        fields.forEach(field => {
            const val = frm.doc[field];
            if (!val) return;
            const cleaned = val.replace(/^\s+/, '').replace(/[,\s]+$/, '').trim();
            if (cleaned !== val) frm.set_value(field, cleaned);
        });
    }
};

// ─────────────────────────────────────────────
//  Original values tracker (for Private Dictionary)
// ─────────────────────────────────────────────
let original_values = {};

// ─────────────────────────────────────────────
//  Item Form Events
// ─────────────────────────────────────────────
frappe.ui.form.on('Item', {

    onload(frm) {
        if (frm.is_new()) frm.set_value('custom_automate', 1);
        _captureOriginals(frm);
        frm._popup_shown_fields = {};
        frm._correction_checked = false;
    },

    refresh(frm) {
        _captureOriginals(frm);
        frm._popup_shown_fields = {};
        frm._correction_checked = false;
    },

    item_code(frm) {
        FormHandler.handleItemField(
            frm, 'item_code', 'item_code_automation',
            (t) => ItemTextFormatter.full(t, false),
            (t) => ItemTextFormatter.realTime(t, false)
        );
    },

    item_name(frm) {
        FormHandler.handleItemField(
            frm, 'item_name', 'item_name_automation',
            (t) => ItemTextFormatter.full(t, true),
            (t) => ItemTextFormatter.realTime(t, true)
        );

        // Sync description AFTER debounce completes (avoid race condition)
        clearTimeout(FormHandler.timeouts['_desc_sync']);
        FormHandler.timeouts['_desc_sync'] = setTimeout(() => {
            if (frm.doc.item_name) frm.set_value('description', frm.doc.item_name);
        }, 350);
    },

    description(frm) {
        FormHandler.handleItemField(
            frm, 'description', 'description_automation',
            (t) => ItemTextFormatter.full(t, false),
            (t) => ItemTextFormatter.realTime(t, false)
        );
    },

    item_group(frm) {
        frm.set_value('is_stock_item', frm.doc.item_group === 'Services' ? 0 : 1);
    },

    custom_item_tax_percentage(frm) {
        if (!frm.doc.custom_automate) return;

        const perc = frm.doc.custom_item_tax_percentage;
        if (perc === '0%') { clearNonEmptyTaxRows(frm); return; }

        if (['5%', '12%', '18%', '28%'].includes(perc)) setupTaxRows(frm, perc);
    },

    validate(frm) {
        if (frm.doc.custom_automate) frm.refresh_field('item_defaults');
    },

    before_save(frm) {
        FormHandler.cleanup(frm, ['item_code', 'item_name', 'description']);

        if (frm.doc.custom_automate === 1) frm.set_value('custom_automate', 0);

        if (!frm._correction_checked) {
            ['item_code', 'item_name', 'description'].forEach(f => checkForManualCorrection(frm, f));
            frm._correction_checked = true;
        }
    }
});

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function _captureOriginals(frm) {
    original_values = {};
    ['item_code', 'item_name', 'description'].forEach(f => {
        original_values[f] = frm.doc[f] || '';
    });
}

function checkForManualCorrection(frm, fieldname) {
    if (!frm._popup_shown_fields) frm._popup_shown_fields = {};
    if (frm._popup_shown_fields[fieldname]) return;

    const oldVal = original_values[fieldname] || '';
    const newVal = frm.doc[fieldname] || '';
    if (!oldVal || !newVal || oldVal === newVal) return;

    const oldWords = oldVal.split(/\s+/);
    const newWords = newVal.split(/\s+/);

    for (let i = 0; i < Math.min(oldWords.length, newWords.length); i++) {
        if (oldWords[i] !== newWords[i]) {
            frm._popup_shown_fields[fieldname] = true;

            frappe.confirm(
                `You changed "<b>${oldWords[i]}</b>" to "<b>${newWords[i]}</b>" in <b>${fieldname.replace(/_/g, ' ')}</b>.<br><br>Do you want to add this to your Private Dictionary?`,
                () => {
                    frappe.call({
                        method: 'automate.automate.doctype.private_dictionary.private_dictionary.add_to_dictionary',
                        args: { original: oldWords[i], corrected: newWords[i] },
                        callback: () => {
                            frappe.show_alert('Added to Private Dictionary');
                            original_values[fieldname] = frm.doc[fieldname];
                        }
                    });
                },
                () => { original_values[fieldname] = frm.doc[fieldname]; }
            );
            break;
        }
    }
}

function clearNonEmptyTaxRows(frm) {
    const rows = frm.doc.taxes || [];
    for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].field_name !== '') frm.get_field('taxes').grid.grid_rows[i].remove();
    }
}

function setupTaxRows(frm, percentage) {
    frm.clear_table('taxes');
    frm.refresh_field('taxes');

    ['In-State', 'Out-State', 'Reverse Charge In-State', 'Reverse Charge Out-State']
        .forEach(category => {
            const child = frm.add_child('taxes');
            child.item_tax_template = `GST ${percentage} - AT`;
            child.tax_category = category;
        });

    frm.refresh_field('taxes');
}