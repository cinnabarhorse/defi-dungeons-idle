import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    asChild
    {...props}
  >
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
        className
      )}
    />
  </DialogPrimitive.Overlay>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Define DialogHeader first so we can reference it in DialogContent
const DialogHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 flex flex-col space-y-1.5 text-left', className)}
    {...props}
  />
));
DialogHeader.displayName = 'DialogHeader';

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    style?: React.CSSProperties;
  }
>(({ className, children, style, ...props }, ref) => {
  // Extract DialogHeader from children to render separately in fixed header area
  const childrenArray = React.Children.toArray(children);
  
  const isDialogHeader = (child: React.ReactNode): boolean => {
    if (!React.isValidElement(child)) return false;
    const type = child.type;
    if (type === DialogHeader) return true;
    if (typeof type === 'object' && type !== null) {
      const typeObj = type as Record<string, unknown>;
      if ('displayName' in typeObj && typeObj.displayName === 'DialogHeader') return true;
      // Handle forwardRef components
      if ('render' in typeObj || '$$typeof' in typeObj) {
        const displayName = typeObj.displayName || typeObj.name;
        if (displayName === 'DialogHeader') return true;
      }
    }
    return false;
  };

  const headerIndex = childrenArray.findIndex(isDialogHeader);

  let header: React.ReactNode = null;
  let content: React.ReactNode[] = [];

  if (headerIndex >= 0) {
    header = childrenArray[headerIndex];
    content = childrenArray.filter((_, index) => index !== headerIndex);
  } else {
    content = childrenArray;
  }

  // Detect mobile for optimized animation (SSR-safe, checks window on mount)
  const [isMobile, setIsMobile] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Detect centered positioning (top: 50% + bottom: auto) for animation adjustment
  const isCentered = style?.top === '50%' && style?.bottom === 'auto';

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        asChild
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, x: '-50%', y: isCentered ? '50%' : '100%' }}
          animate={{ opacity: 1, x: '-50%', y: isCentered ? '-50%' : 0 }}
          exit={{ opacity: 0, x: '-50%', y: isCentered ? '50%' : '100%' }}
          transition={
            isMobile
              ? {
                  type: 'tween',
                  ease: [0.16, 1, 0.3, 1],
                  duration: 0.3,
                  x: { duration: 0 },
                }
              : {
                  type: 'spring',
                  stiffness: 300,
                  damping: 30,
                  mass: 0.8,
                  x: { duration: 0 },
                }
          }
          className={cn(
            'fixed left-[50%] z-50 flex flex-col w-full max-w-lg border bg-background shadow-lg sm:rounded-lg sm:rounded-b-none',
            className
          )}
          style={{
            bottom: '2rem',
            maxHeight: 'calc(90vh - 4rem)',
            willChange: 'transform, opacity',
            transform: 'translateZ(0)',
            ...style,
          }}
        >
          {/* Fixed Header - Default padding: px-6 pt-6 pb-4 */}
          {header && (
            <div className="flex-shrink-0 flex items-center justify-between gap-4 px-6 pt-6 pb-4 border-b">
              {header}
              <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground flex items-center justify-center">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          )}
          {!header && (
            <div className="flex-shrink-0 flex items-center justify-end px-6 pt-6 pb-4 border-b">
              <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground flex items-center justify-center">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            </div>
          )}
          {/* Scrollable Content - Default padding: px-6 pt-6 pb-6 */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-6 pb-6">
            {content}
          </div>
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
