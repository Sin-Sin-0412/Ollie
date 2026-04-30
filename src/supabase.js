import { createClient } from '@supabase/supabase-js';

// ★ さっきメモした情報をここに貼り付けてください
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabaseと接続するための「クライアント」を作成して、外から使えるようにする
export const supabase = createClient(supabaseUrl, supabaseKey);