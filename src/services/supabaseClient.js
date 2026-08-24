import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRole = import.meta.env.VITE_SUPABASE_SERVICE_ROLE;

// Cliente normal para el uso diario
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Cliente MAESTRO (Solo para crear usuarios sin cerrar la sesión del admin)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});