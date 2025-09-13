8) 1-on-1 SCHEDULING (Calendly)
File: backend/services/calendly.js
- getOpenSlots(preferEarlyWeek:boolean)
- proposeTwoSlots(slots) → [A,B] for A/B close
- bookSlot(slot, contactDetails) → POST to Calendly
- If contact.location == 'Edmonton' → add in-person option text + location: "9910 39 Ave, Edmonton"
