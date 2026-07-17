import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config';

/** false = mode local (Supabase pas encore configuré dans src/config.ts). */
export const supabaseActif = SUPABASE_URL.startsWith('https://') && SUPABASE_ANON_KEY.length > 20;

export const supabase = supabaseActif ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// accès console en développement (débogage)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).sb = supabase;
