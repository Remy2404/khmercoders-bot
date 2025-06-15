// Define Cloudflare bindings for D1 database and other resources
declare global {
  interface CloudflareBindings {
    DB: D1Database;
    // Add other bindings here as needed
  }
}

export {};
