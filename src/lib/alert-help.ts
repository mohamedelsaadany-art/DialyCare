/**
 * How to turn blocked alerts back on. The steps depend on where the app runs:
 * an app opened from the home-screen icon has no address bar (no 🔒), so the
 * setting lives in the phone's own settings.
 */
export type AlertHelpPlace = 'installed-android' | 'installed-ios' | 'browser';

export function alertHelpPlace(installed: boolean, ios: boolean): AlertHelpPlace {
  if (!installed) return 'browser';
  return ios ? 'installed-ios' : 'installed-android';
}

export function alertHelpSteps(place: AlertHelpPlace, isAr: boolean): string[] {
  if (place === 'installed-android') {
    return isAr
      ? [
          'اقفل التطبيق، واضغط ضغطة طويلة على أيقونة وَصْلِتي.',
          'اختار «معلومات التطبيق» ⓘ ثم «الإشعارات».',
          'شغّل الإشعارات، وارجع افتح التطبيق.',
        ]
      : [
          'Close the app and press and hold the Waslity icon.',
          'Choose “App info” ⓘ, then “Notifications”.',
          'Turn notifications on, then open the app again.',
        ];
  }
  if (place === 'installed-ios') {
    return isAr
      ? ['افتح «الإعدادات» في الموبايل.', 'اختار «الإشعارات» ثم وَصْلِتي.', 'شغّل «السماح بالإشعارات»، وارجع افتح التطبيق.']
      : ['Open the phone’s Settings.', 'Choose Notifications, then Waslity.', 'Turn on “Allow Notifications”, then open the app again.'];
  }
  return isAr
    ? ['اضغط على 🔒 جنب عنوان الموقع فوق.', 'اختار «الأذونات» ثم «الإشعارات».', 'اختار «سماح»، والتنبيهات هتشتغل لوحدها.']
    : ['Tap 🔒 next to the website address.', 'Open Permissions, then Notifications.', 'Choose “Allow” and alerts turn on by themselves.'];
}
