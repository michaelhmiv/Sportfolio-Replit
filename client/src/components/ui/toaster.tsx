import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider swipeDirection="right" swipeThreshold={50}>
      {toasts.map(function ({ id, title, description, action, ...props }, index) {
        return (
          <Toast key={id} index={index} data-testid={`toast-${id}`} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose data-testid={`toast-close-${id}`} />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
