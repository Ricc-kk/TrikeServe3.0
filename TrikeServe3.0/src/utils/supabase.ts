// Re-export the single shared Supabase client from `src/lib/supabase.ts`
// This prevents multiple GoTrueClient instances in the same browser context.
import { supabase as sharedSupabase } from '@/lib/supabase';

export const supabase = sharedSupabase;

