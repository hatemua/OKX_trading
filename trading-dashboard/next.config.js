/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    BOT_API_URL: process.env.BOT_API_URL || 'http://localhost:5004'
  }
}

module.exports = nextConfig