// Ported to Svelte 5 from 8bitcn/ui (MIT, see ../LICENSE): components/ui/8bit/toast.tsx
import { toast as sonnerToast } from 'svelte-sonner';
import Toast from './toast.svelte';

export function toast(title: string) {
	return sonnerToast.custom(Toast, { componentProps: { title } });
}
