export const STORE_CONTACT = {
  address: "Recoleta 5726, Huechuraba",
  phone: "+56940999386",
  phoneLabel: "+569 4099 9386",
} as const;

const mapQuery = encodeURIComponent(STORE_CONTACT.address);
export const STORE_MAP_HREF = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
export const STORE_MAP_EMBED = `https://www.google.com/maps?q=${mapQuery}&output=embed`;
