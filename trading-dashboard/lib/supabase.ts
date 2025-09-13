import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper function to fetch bot API
export const fetchBotAPI = async (endpoint: string, options?: RequestInit) => {
  const baseUrl = process.env.BOT_API_URL || 'http://localhost:5004';
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });
  
  if (!response.ok) {
    throw new Error(`Bot API error: ${response.statusText}`);
  }
  
  return response.json();
};