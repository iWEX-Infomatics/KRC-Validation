# /home/devmadhu/new-bench/apps/automate/automate/customization/bank_account.py

import frappe


def set_bank_account_name(doc, method=None):

    if not doc.is_new():
        return

    if not doc.party or not doc.bank_account_no:
        return

    first_word = doc.party.strip().split(" ")[0]

    bank_no = str(doc.bank_account_no).strip()
    last_4 = bank_no[-4:] if len(bank_no) >= 4 else bank_no

    new_name = f"{first_word} - {last_4}"

    doc.account_name = new_name

    doc.name = new_name