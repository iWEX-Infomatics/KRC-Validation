import frappe


def set_bank_account_name(doc, method=None):

    if not doc.party or not doc.bank_account_no:
        return

    party_words = doc.party.strip().split()

    if len(party_words) >= 2 and len(party_words[0]) <= 2:
        party_part = f"{party_words[0]} {party_words[1]}"
    else:
        party_part = party_words[0]

    bank_abbr = (doc.custom_bank_abbr or "").strip()

    bank_no = str(doc.bank_account_no).strip()
    last_4 = bank_no[-4:] if len(bank_no) >= 4 else bank_no

    if bank_abbr:
        new_name = f"{party_part} - {bank_abbr} - {last_4}"
    else:
        new_name = f"{party_part} - {last_4}"

    doc.account_name = new_name
    doc.name = new_name