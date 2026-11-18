export default function robots() {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/me','/notifications','/publish','/settings','/api/','/auth/'] }] };
}
