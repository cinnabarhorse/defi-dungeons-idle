export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // Check user agent
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android',
    'webos',
    'iphone',
    'ipad',
    'ipod',
    'blackberry',
    'windows phone',
    'mobile',
  ];

  const isMobileUA = mobileKeywords.some((keyword) =>
    userAgent.includes(keyword)
  );

  // Check screen size (consider tablets as mobile for gaming)
  const isSmallScreen = window.innerWidth <= 1024;

  // Check for touch capability
  const hasTouchScreen =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;

  return isMobileUA || (isSmallScreen && hasTouchScreen);
}

export function isLandscape(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth > window.innerHeight;
}

export function getScreenInfo() {
  if (typeof window === 'undefined') {
    return {
      width: 0,
      height: 0,
      isMobile: false,
      isLandscape: false,
      pixelRatio: 1,
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: isMobileDevice(),
    isLandscape: isLandscape(),
    pixelRatio: window.devicePixelRatio || 1,
  };
}
