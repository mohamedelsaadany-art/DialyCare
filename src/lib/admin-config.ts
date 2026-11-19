/** Administrator contacts. Safe to import on server and client. */
export const ADMIN_CONFIG = {
  primaryPhone: '+201080641670', // Senior Resident contact (Primary Administrator)
  seniorResidentPhone: '+201080641670', // Senior Resident contact
  technicalAdminPhone: '+201552885823', // Technical administrator
};

/** Senior Resident's WhatsApp number, as the patient-facing contact. */
export const ADMIN_WHATSAPP = ADMIN_CONFIG.seniorResidentPhone;
