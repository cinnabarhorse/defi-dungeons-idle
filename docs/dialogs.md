# Dialog Component Best Practices

This document outlines best practices for using the Dialog component (`apps/client/src/components/ui/Dialog.tsx`).

## Overview

The Dialog component is built on Radix UI primitives with Framer Motion animations. It provides a flexible modal system with automatic header extraction and optimized animations for mobile and desktop.

## Animation

### How It Works

The Dialog uses Framer Motion for animations with different strategies for mobile and desktop:

**Desktop (≥768px):**
- Uses spring physics (`stiffness: 300, damping: 30, mass: 0.8`)
- Slides up from bottom (`y: '100%'` → `y: 0`)
- Horizontal centering via `x: '-50%'` transform

**Mobile (<768px):**
- Uses tween easing (`ease: [0.16, 1, 0.3, 1], duration: 0.3`)
- Disables horizontal animation (`x: { duration: 0 }`)
- Optimized for touch interactions

### Centered Positioning

To center the dialog vertically instead of bottom-aligned, pass a `style` prop:

```tsx
<DialogContent
  style={{
    bottom: 'auto',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  }}
>
```

The component automatically detects centered positioning and adjusts animations:
- Initial: `y: '50%'` (below center)
- Animate: `y: '-50%'` (centered)
- Exit: `y: '50%'` (below center)

### Overlay Animation

The overlay fades in/out independently with a 200ms duration:
- `initial={{ opacity: 0 }}`
- `animate={{ opacity: 1 }}`
- `exit={{ opacity: 0 }}`

## Header Rendering

### Automatic Extraction

The `DialogContent` component automatically extracts `DialogHeader` from its children and renders it separately:

1. **Header Section**: Fixed at top with close button
2. **Content Section**: Scrollable area below header

### Usage Pattern

Always use `DialogHeader` and `DialogTitle` for proper structure:

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>My Dialog Title</DialogTitle>
  </DialogHeader>
  {/* Rest of content */}
</DialogContent>
```

### Header Layout

When a header is present:
- Header content on the left
- Close button (X) on the right
- Automatic flex layout with `justify-between`

When no header is present:
- Only close button rendered
- Right-aligned

### Overriding Header Padding

To customize header padding, use Tailwind's arbitrary variants:

```tsx
<DialogContent className="[&>div:first-child]:pt-5 [&>div:first-child]:pb-4">
  <DialogHeader>
    <DialogTitle>Title</DialogTitle>
  </DialogHeader>
</DialogContent>
```

Default header padding: `px-6 pt-6 pb-4`

## Padding Best Practices

### Default Padding Structure

The component applies default padding:
- **Header**: `px-6 pt-6 pb-4`
- **Content**: `px-6 pt-6 pb-6`

### Flush Scrolling Pattern

For scrollable content that should be flush with the top when scrolling:

1. **Remove default content padding** using arbitrary variants:
   ```tsx
   <DialogContent className="[&>div:last-child]:pt-0 [&>div:last-child]:px-0 [&>div:last-child]:pb-0">
   ```

2. **Add padding to scrollable container** (horizontal and bottom only):
   ```tsx
   <div className="overflow-y-auto px-3 pb-3">
     {/* Content */}
   </div>
   ```

3. **Add top padding to first child** for initial spacing:
   ```tsx
   <div className="overflow-y-auto px-3 pb-3">
     <div className="pt-4 pb-2 border-b">
       {/* First section - has top padding */}
     </div>
     {/* Rest of content - flush to top when scrolling */}
   </div>
   ```

This pattern ensures:
- Content looks good on initial render (first child has padding)
- Content can scroll flush to the top edge
- Horizontal and bottom padding maintained

### Custom Padding Examples

**Full custom padding override:**
```tsx
<DialogContent className="[&>div:first-child]:pt-5 [&>div:first-child]:pb-4 [&>div:last-child]:pt-0 [&>div:last-child]:px-0 [&>div:last-child]:pb-0">
  <DialogHeader>
    <DialogTitle>Title</DialogTitle>
  </DialogHeader>
  <div className="px-3 pb-3 overflow-y-auto">
    {/* Custom padding */}
  </div>
</DialogContent>
```

**Simple override (keep defaults, just adjust header):**
```tsx
<DialogContent className="[&>div:first-child]:pt-4">
  <DialogHeader>
    <DialogTitle>Title</DialogTitle>
  </DialogHeader>
  {/* Content uses default padding */}
</DialogContent>
```

## Component API

### DialogContent Props

```tsx
interface DialogContentProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  style?: React.CSSProperties; // For custom positioning
  className?: string; // For styling overrides
  children: React.ReactNode; // Must include DialogHeader if using header
}
```

### DialogHeader Props

```tsx
interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
  children: React.ReactNode; // Typically DialogTitle
}
```

### DialogTitle Props

```tsx
interface DialogTitleProps extends ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
  className?: string;
  children: React.ReactNode;
}
```

## Common Patterns

### Simple Dialog

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Confirm Action</DialogTitle>
    </DialogHeader>
    <p>Are you sure you want to proceed?</p>
  </DialogContent>
</Dialog>
```

### Centered Dialog with Custom Padding

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent
    className="[&>div:first-child]:pt-5 [&>div:first-child]:pb-4"
    style={{
      bottom: 'auto',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    }}
  >
    <DialogHeader>
      <DialogTitle>Select Item</DialogTitle>
    </DialogHeader>
    <div className="overflow-y-auto px-3 pb-3">
      <div className="pt-4 pb-2 border-b">
        {/* First section */}
      </div>
      {/* Scrollable content */}
    </div>
  </DialogContent>
</Dialog>
```

### Dialog Without Header

```tsx
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    {/* No DialogHeader - close button will still appear */}
    <p>Content here</p>
  </DialogContent>
</Dialog>
```

## Performance Considerations

- Mobile detection uses `useEffect` with window resize listener (SSR-safe)
- Animations use `willChange` and `translateZ(0)` for GPU acceleration
- Content area uses `flex-1 min-h-0` for proper flex scrolling
- Max height constraint: `calc(90vh - 4rem)`

## Accessibility

- Close button includes `sr-only` text: "Close"
- Uses Radix UI primitives for proper ARIA attributes
- Focus management handled automatically
- Keyboard navigation (ESC to close) built-in















