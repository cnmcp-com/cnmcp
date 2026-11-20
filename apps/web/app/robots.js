export default function robots() {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/me','/notifications','/publish','/publish-resource','/settings','/api/','/auth/'] }] };
}
