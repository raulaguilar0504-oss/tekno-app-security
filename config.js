// Configuración de conexión a Supabase.
// Estos valores son públicos por diseño (anon key), la seguridad real la dan
// las políticas RLS definidas en sql/schema.sql — NO pongas aquí la service_role key.
window.APP_CONFIG = {
  SUPABASE_URL: "https://jtndpgertuzoohkqzvbu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_fdoVw0ZQS24k4K5T5yw-0g_6kSaMUds",
  APP_NAME: "Bitácora de Seguridad",
  STORAGE_BUCKET: "bitacora-fotos",
  QR_PREFIX: "SPI-AP:" // prefijo que identifica los QR generados por esta app
};
