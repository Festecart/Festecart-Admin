import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShoppingCart, AlertTriangle, CreditCard,
  Banknote, CheckCircle2, MapPin, Eye, EyeOff, Loader2, Trash2
} from 'lucide-react';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useToast } from '@/hooks/use-toast';
import {
  collection, addDoc, serverTimestamp,
  doc as fsDoc, getDoc,
} from 'firebase/firestore';
import { db } from '@/integrations/firebase/config';
import { ShippingEstimate } from '@/components/ShippingEstimate';
import { sendOrderConfirmationEmail } from '@/lib/emailService';

const fmt = (p: number) => '₹ ' + p.toLocaleString('en-IN');

// ── Inline Login ──────────────────────────────────────────────────
interface InlineLoginProps {
  onLoginSuccess: () => void;
  onGuestCheckout: () => void;
}
function InlineLogin({ onLoginSuccess, onGuestCheckout }: InlineLoginProps) {
  const { signIn } = useAuth();
  const { toast } = useToast();
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credential || !password) { toast({ title: 'Fill in all fields', variant: 'destructive' }); return; }
    setLoading(true);
    const { error } = await signIn(credential, password);
    if (error) { toast({ title: 'Login failed', description: error.message, variant: 'destructive' }); }
    else { onLoginSuccess(); }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg">Fill in your details</CardTitle>
          <button type="button" onClick={onGuestCheckout} className="text-xs text-primary hover:underline font-medium">Guest Checkout &gt;</button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-cred">Phone Number or Email</Label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 border border-border rounded-lg bg-muted text-sm shrink-0 select-none">IN +91</span>
              <Input id="login-cred" value={credential} onChange={e => setCredential(e.target.value)} placeholder="9876543210 or email" autoComplete="username" required className="flex-1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-pw">Enter Password</Label>
            <div className="relative">
              <Input id="login-pw" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" required className="pr-10" />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="text-right"><Link to="/reset-password" className="text-xs text-primary hover:underline">Forgot Password?</Link></div>
          </div>
          <Button type="submit" variant="maroon" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Login
          </Button>
          <p className="text-center text-sm text-muted-foreground cursor-pointer hover:text-primary">Checkout using OTP</p>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Guest Delivery Form ───────────────────────────────────────────
interface GuestForm { firstName: string; lastName: string; email: string; phone: string; address: string; city: string; state: string; pincode: string; }
interface GuestDeliveryFormProps { value: GuestForm; onChange: (f: GuestForm) => void; onBack: () => void; onSaved: () => void; }

function GuestDeliveryForm({ value, onChange, onBack, onSaved }: GuestDeliveryFormProps) {
  const { toast } = useToast();
  const set = (k: keyof GuestForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.firstName || !value.email || !value.phone || !value.address || !value.pincode) {
      toast({ title: 'Please fill all required fields', variant: 'destructive' }); return;
    }
    onSaved(); toast({ title: 'Details saved!' });
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-display text-lg">Delivery Details</CardTitle>
          <button type="button" onClick={onBack} className="text-xs text-primary hover:underline">&lt; Login instead</button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>First Name *</Label><Input value={value.firstName} onChange={set('firstName')} required /></div>
            <div className="space-y-1.5"><Label>Last Name</Label><Input value={value.lastName} onChange={set('lastName')} /></div>
          </div>
          <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={value.email} onChange={set('email')} required /></div>
          <div className="space-y-1.5">
            <Label>Phone *</Label>
            <div className="flex gap-2">
              <span className="flex items-center px-3 border border-border rounded-lg bg-muted text-sm shrink-0 select-none">IN +91</span>
              <Input type="tel" value={value.phone} onChange={set('phone')} required className="flex-1" />
            </div>
          </div>
          <div className="space-y-1.5"><Label>Street Address *</Label><Input value={value.address} onChange={set('address')} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>City</Label><Input value={value.city} onChange={set('city')} /></div>
            <div className="space-y-1.5"><Label>State</Label><Input value={value.state} onChange={set('state')} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Pincode *</Label>
            <Input value={value.pincode} onChange={e => onChange({ ...value, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} maxLength={6} required />
          </div>
          <Button type="submit" variant="maroon" className="w-full">Save Details</Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <button type="button" onClick={onBack} className="text-primary hover:underline font-medium">Login</button>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Billing Address Section ───────────────────────────────────────
function BillingSection({ profile }: { profile: any }) {
  const [diff, setDiff] = useState(false);
  const [b, setB] = useState({ name: '', phone: '', address: '', city: '', state: '', pincode: '' });
  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setB(v => ({ ...v, [k]: e.target.value }));
  return (
    <>
      <div className="px-1">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={diff} onChange={e => setDiff(e.target.checked)} className="w-4 h-4 accent-primary" />
          <span className="text-sm text-muted-foreground">Billing Address is different from shipping address</span>
        </label>
      </div>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="font-display text-lg">Billing Address</CardTitle></CardHeader>
        <CardContent>
          {!diff ? (
            profile?.address ? (
              <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
                <div className="text-sm space-y-0.5">
                  <p className="font-semibold text-foreground">{profile.name}</p>
                  {profile.phone    && <p className="text-muted-foreground">{profile.phone}</p>}
                  {profile.address  && <p className="text-muted-foreground">{profile.address},</p>}
                  {profile.city     && <p className="text-muted-foreground">{profile.city}, {profile.state}, India,</p>}
                  {profile.state    && <p className="text-muted-foreground">{profile.state}, India - {profile.pincode}</p>}
                </div>
                <Link to="/user/profile"><Button variant="maroon" size="sm" className="shrink-0">Change</Button></Link>
              </div>
            ) : (<p className="text-sm text-muted-foreground italic">Same as shipping address.</p>)
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label>Full Name</Label><Input value={b.name} onChange={setF('name')} /></div>
                <div className="space-y-1.5 col-span-2"><Label>Phone</Label><Input type="tel" value={b.phone} onChange={setF('phone')} /></div>
                <div className="space-y-1.5 col-span-2"><Label>Address</Label><Input value={b.address} onChange={setF('address')} /></div>
                <div className="space-y-1.5"><Label>City</Label><Input value={b.city} onChange={setF('city')} /></div>
                <div className="space-y-1.5"><Label>State</Label><Input value={b.state} onChange={setF('state')} /></div>
                <div className="space-y-1.5"><Label>Pincode</Label><Input value={b.pincode} onChange={e => setB(v => ({ ...v, pincode: e.target.value.replace(/\D/g,'').slice(0,6) }))} maxLength={6} /></div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

// ── Main Checkout Page ────────────────────────────────────────────
export default function CheckoutPage() {
  const { items, subtotal, clearCart, removeFromCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useUserProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [showGuest,  setShowGuest]  = useState(false);
  const [guestSaved, setGuestSaved] = useState(false);
  const [guestForm,  setGuestForm]  = useState<GuestForm>({
    firstName: '', lastName: '', email: '', phone: '', address: '', city: '', state: '', pincode: '',
  });

  const [note,           setNote]           = useState('');
  const [coupon,         setCoupon]         = useState('');
  const [couponApplied,  setCouponApplied]  = useState(false);
  const [paymentMethod,  setPaymentMethod]  = useState('cod');
  const [manualPincode,  setManualPincode]  = useState('');
  const [placing,        setPlacing]        = useState(false);

  const [shippingResult,  setShippingResult]  = useState<import('@/lib/shippingUtils').ShippingResult | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [undeliverableIds, setUndeliverableIds] = useState<string[]>([]);

  const profilePincode   = user ? (profile?.pincode ?? '') : guestForm.pincode;
  const effectivePincode = profilePincode || manualPincode;

  // Shipping rate
  useEffect(() => {
    const p = effectivePincode?.trim();
    if (!p || p.length !== 6) { setShippingResult(null); return; }
    let cancelled = false;
    setShippingLoading(true);
    const cartProductIds = items.map(i => i.id);
    const freeShip = couponApplied && coupon?.toLowerCase() === 'freeship';
    import('@/lib/shippingUtils')
      .then(({ getShippingRate }) => getShippingRate(p, subtotal, cartProductIds, freeShip))
      .then(result => { if (!cancelled) setShippingResult(result); })
      .finally(() => { if (!cancelled) setShippingLoading(false); });
    return () => { cancelled = true; };
  }, [effectivePincode, subtotal, couponApplied, coupon, items]);

  // Per-item deliverability
  useEffect(() => {
    const p = effectivePincode?.trim();
    if (!p || p.length !== 6 || !items.length) { setUndeliverableIds([]); return; }
    import('@/lib/shippingUtils')
      .then(({ getUndeliverableProductIds }) => getUndeliverableProductIds(p, items.map(i => i.id)))
      .then(ids => setUndeliverableIds(ids));
  }, [effectivePincode, items]);

  const isServiceable = !shippingLoading && shippingResult !== null &&
    shippingResult.isServiceable === true && undeliverableIds.length === 0;
  const shippingCharge = isServiceable ? Number(shippingResult?.charge ?? 0) : 0;
  const totalPayable   = subtotal + shippingCharge;

  // ── Place Order ─────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (items.length === 0) { toast({ title: 'Cart is empty', variant: 'destructive' }); return; }
    if (!isServiceable)     { toast({ title: 'Delivery not available', description: 'Enter a serviceable pincode.', variant: 'destructive' }); return; }
    if (!user && !guestSaved) { toast({ title: 'Please fill in your details first', variant: 'destructive' }); return; }

    setPlacing(true);
    try {
      // ── Stock validation — fetch only the cart products individually ──
      // DO NOT use getDocs(collection(db,'products')) — that fetches everything
      const stockChecks = await Promise.all(
        items.map(item => getDoc(fsDoc(db, 'products', item.id)))
      );
      const outOfStock = items.filter(cartItem => {
        const snap = stockChecks.find(s => s.id === cartItem.id);
        if (!snap || !snap.exists()) return false;
        const inv = snap.data()?.inventory_count ?? null;
        return inv !== null && inv < cartItem.quantity;
      });
      if (outOfStock.length > 0) {
        toast({
          title: 'Some items are out of stock',
          description: outOfStock.map(i => i.name).join(', '),
          variant: 'destructive',
        });
        setPlacing(false);
        return;
      }

      // ── Build shipping address ────────────────────────────────────
      const shippingAddr = user
        ? { name: profile?.name, phone: profile?.phone, address: profile?.address, city: profile?.city, state: profile?.state, pincode: profile?.pincode }
        : { name: `${guestForm.firstName} ${guestForm.lastName}`.trim(), phone: guestForm.phone, address: guestForm.address, city: guestForm.city, state: guestForm.state, pincode: guestForm.pincode };

      // ── Generate order number ─────────────────────────────────────
      const orderNumber = `FC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // ── Build order payload ───────────────────────────────────────
      const orderPayload = {
        order_number:    orderNumber,
        user_id:         user?.uid ?? null,
        customer_email:  user ? user.email : guestForm.email,
        guest_email:     user ? null : guestForm.email,
        guest_name:      user ? null : `${guestForm.firstName} ${guestForm.lastName}`.trim(),
        guest_phone:     user ? null : guestForm.phone,
        status:          'confirmed',
        payment_method:  paymentMethod,
        payment_status:  paymentMethod === 'cod' ? 'pending' : 'pending',
        subtotal,
        shipping_charge: shippingCharge,
        total:           totalPayable,
        note:            note || null,
        coupon_code:     couponApplied ? coupon : null,
        shipping_address: shippingAddr,
        items: items.map(i => ({
          product_id: i.id,
          name:       i.name,
          price:      i.price,
          quantity:   i.quantity,
          image:      i.image ?? null,
        })),
        confirmed_at: serverTimestamp(),
        created_at:   serverTimestamp(),
        updated_at:   serverTimestamp(),
      };

      await addDoc(collection(db, 'orders'), orderPayload);

      // ── Send order confirmation email ─────────────────────────
      const customerEmail = user ? user.email : guestForm.email;
      const customerName  = user
        ? (profile?.name || user.email?.split('@')[0] || 'Customer')
        : `${guestForm.firstName} ${guestForm.lastName}`.trim() || 'Customer';

      if (customerEmail) {
        sendOrderConfirmationEmail({
          orderNumber:     orderNumber,
          customerName:    customerName,
          customerEmail:   customerEmail,
          items:           items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity, image: i.image ?? null })),
          subtotal,
          shippingCharge:  shippingCharge,
          total:           totalPayable,
          paymentMethod:   paymentMethod,
          shippingAddress: shippingAddr,
        }).catch(err => console.error('[Checkout] Confirmation email failed:', err));
      }

      clearCart();
      toast({ title: 'Order placed successfully! 🎉', description: 'We will contact you shortly.' });
      navigate('/user/dashboard');
    } catch (err: any) {
      console.error('[Checkout] Place order error:', err);
      toast({ title: 'Failed to place order', description: err.message, variant: 'destructive' });
    } finally {
      setPlacing(false);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────
  if (authLoading || (user && profileLoading)) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  // ── Empty Cart ───────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <Layout>
        <div className="container mx-auto px-4 lg:px-8 py-20 text-center">
          <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-display text-2xl font-bold mb-2">Nothing to checkout</h1>
          <p className="text-muted-foreground mb-6">Your cart is empty.</p>
          <Link to="/products"><Button variant="maroon">Browse Products</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 lg:px-8 py-10">
        <h1 className="font-display text-3xl font-bold text-foreground mb-8">Checkout</h1>
        <div className="grid lg:grid-cols-2 gap-8 items-start">

          {/* ── LEFT column ── */}
          <div className="space-y-5">

            {/* Products list */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground font-medium">Products</p>
                  {undeliverableIds.length > 0 && effectivePincode.length === 6 && (
                    <span className="text-xs font-medium text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {undeliverableIds.length} item{undeliverableIds.length > 1 ? 's' : ''} can't be delivered
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {items.map(item => {
                  const hasDiscount = item.compare_at_price && item.compare_at_price > item.price;
                  const cantDeliver = undeliverableIds.includes(item.id);
                  return (
                    <div key={item.id} className={`flex gap-3 items-start rounded-lg p-2 -mx-2 transition-colors ${cantDeliver ? 'bg-destructive/5 border border-destructive/20' : ''}`}>
                      <div className="relative shrink-0">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted">
                          {item.image
                            ? <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><ShoppingCart className="h-6 w-6 text-muted-foreground" /></div>}
                        </div>
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{item.quantity}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2 text-foreground">{item.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm font-bold">{fmt(item.price * item.quantity)}</span>
                          {hasDiscount && <span className="text-xs text-muted-foreground line-through">{fmt(item.compare_at_price! * item.quantity)}</span>}
                        </div>
                        {cantDeliver && effectivePincode.length === 6 && (
                          <div className="mt-2 flex items-start justify-between gap-2">
                            <p className="text-xs text-destructive font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />Not deliverable to {effectivePincode}. Remove to proceed.
                            </p>
                            <button onClick={() => removeFromCart(item.id)}
                              className="flex items-center gap-1 text-xs font-medium text-white bg-destructive hover:bg-destructive/90 rounded px-2 py-1 transition-colors shrink-0">
                              <Trash2 className="h-3 w-3" />Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Note */}
            <Card><CardContent className="pt-5">
              <Textarea placeholder="Add Note" value={note} onChange={e => setNote(e.target.value)} className="resize-none min-h-[80px]" />
            </CardContent></Card>

            {/* Coupon */}
            <Card><CardContent className="pt-5">
              <div className="flex gap-2">
                <Input placeholder="Coupon Code" value={coupon} onChange={e => setCoupon(e.target.value)} className="flex-1" disabled={couponApplied} />
                <Button variant="maroon" disabled={couponApplied}
                  onClick={() => { if (!coupon) { toast({ title: 'Enter a coupon code', variant: 'destructive' }); return; } toast({ title: 'Invalid coupon', variant: 'destructive' }); }}>
                  {couponApplied ? 'Applied' : 'Add'}
                </Button>
              </div>
            </CardContent></Card>

            {/* Summary */}
            <Card><CardContent className="pt-5 space-y-3">
              <h3 className="font-display text-lg font-semibold">Summary</h3>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Taxable</span><span>{fmt(subtotal)}</span></div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Shipping</span>
                <span className={isServiceable && shippingCharge === 0 ? 'text-green-600 font-medium' : ''}>
                  {shippingLoading ? '…' : isServiceable ? (shippingCharge === 0 ? 'Free' : fmt(shippingCharge)) : '—'}
                </span>
              </div>
              {shippingResult && isServiceable && <ShippingEstimate result={shippingResult} loading={shippingLoading} />}
              <div className="border-t border-border pt-3 flex justify-between font-bold text-base">
                <span>Amount Payable</span><span>{fmt(totalPayable)}</span>
              </div>
            </CardContent></Card>
          </div>

          {/* ── RIGHT column ── */}
          <div className="space-y-5">

            {/* Auth */}
            {!user && !showGuest && (
              <InlineLogin onLoginSuccess={() => {}} onGuestCheckout={() => setShowGuest(true)} />
            )}
            {!user && showGuest && (
              <GuestDeliveryForm value={guestForm} onChange={setGuestForm} onBack={() => setShowGuest(false)} onSaved={() => setGuestSaved(true)} />
            )}

            {/* Logged-in account card */}
            {user && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg">Logged in as</CardTitle>
                    <Link to="/user/profile"><Button variant="ghost" size="sm" className="text-xs text-primary">Fill in your details</Button></Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
                    <div className="text-sm space-y-0.5">
                      <p className="font-semibold text-foreground">{profile?.name || user.email?.split('@')[0]}</p>
                      <p className="text-muted-foreground">{user.email}</p>
                      {profile?.phone && <p className="text-muted-foreground">{profile.phone}</p>}
                    </div>
                    <Button variant="maroon" size="sm" onClick={() => navigate('/user/login')}>Change</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Shipping address */}
            {user && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-lg">Shipping Address</CardTitle>
                    <Link to="/user/profile"><Button variant="ghost" size="sm" className="text-xs text-primary">{profile?.address ? 'Change' : 'Add Address'}</Button></Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {profile?.address ? (
                    <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-border bg-muted/30">
                      <div className="text-sm space-y-0.5">
                        <p className="font-semibold text-foreground">{profile.name}</p>
                        {profile.phone   && <p className="text-muted-foreground">{profile.phone}</p>}
                        {profile.address && <p className="text-muted-foreground">{profile.address},</p>}
                        {profile.city    && <p className="text-muted-foreground">{profile.city}, {profile.state}, India,</p>}
                        {profile.state   && <p className="text-muted-foreground">{profile.state}, India - {profile.pincode}</p>}
                      </div>
                      <Link to="/user/profile"><Button variant="maroon" size="sm" className="shrink-0">Change</Button></Link>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg border border-dashed border-border text-center">
                      <p className="text-sm text-muted-foreground mb-3">No address saved yet.</p>
                      <Link to="/user/profile"><Button variant="gold-outline" size="sm">+ Add Address</Button></Link>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {user && <BillingSection profile={profile} />}

            {/* Shipping Method */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="font-display text-lg">Shipping Method</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {!profilePincode && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />Check delivery availability
                    </Label>
                    <Input placeholder="Enter 6-digit pincode" value={manualPincode}
                      onChange={e => setManualPincode(e.target.value.replace(/\D/g, '').slice(0, 6))} maxLength={6} className="max-w-[200px]" />
                  </div>
                )}
                {effectivePincode.length === 6 ? (
                  isServiceable ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />Delivery available
                        <span className="text-muted-foreground ml-1">({effectivePincode})</span>
                      </div>
                      <label className="flex items-center gap-3 p-3 rounded-lg border border-primary bg-primary/5 cursor-pointer">
                        <input type="radio" name="shipping" defaultChecked className="accent-primary" readOnly />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{shippingResult?.methodName ?? 'Standard Delivery'}</p>
                          {shippingResult?.deliveryMin != null
                            ? <p className="text-xs text-muted-foreground">{shippingResult.deliveryMin}–{shippingResult.deliveryMax} {shippingResult.timeUnit ?? 'days'}</p>
                            : <p className="text-xs text-muted-foreground">2–4 business days</p>}
                        </div>
                        <span className={`text-sm font-bold ${shippingCharge === 0 ? 'text-green-600' : 'text-foreground'}`}>
                          {shippingLoading ? '…' : shippingCharge === 0 ? 'FREE' : fmt(shippingCharge)}
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/5 border border-destructive/20 rounded-lg px-3 py-2.5">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {undeliverableIds.length > 0
                          ? <>Some items cannot be delivered to <strong>{effectivePincode}</strong>. See items marked above.</>
                          : shippingResult?.unavailableReason === 'product_not_eligible'
                            ? <>One or more items are <strong>not eligible for delivery</strong> to this pincode.</>
                            : <>Delivery is <strong>not available</strong> for pincode <strong>{effectivePincode}</strong>.</>}
                      </span>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {profilePincode ? 'Checking pincode from your saved address…' : 'Enter a 6-digit pincode to check availability.'}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Payment Methods */}
            <Card>
              <CardHeader className="pb-3"><CardTitle className="font-display text-lg">Payment Methods</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[
                  { value: 'cod',    label: 'Cash on Delivery',                          Icon: Banknote  },
                  { value: 'online', label: 'Online Payment (UPI / Card / Net Banking)', Icon: CreditCard },
                ].map(({ value, label, Icon }) => (
                  <label key={value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${paymentMethod === value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
                    <input type="radio" name="payment" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} className="accent-primary" />
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </CardContent>
            </Card>

            {/* Place Order */}
            <Button variant="maroon" size="lg" className="w-full" onClick={handlePlaceOrder}
              disabled={placing || !isServiceable || shippingLoading || (!user && !guestSaved)}>
              {placing
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Placing Order…</>
                : isServiceable
                  ? `Place Order — ${fmt(totalPayable)}`
                  : 'Enter a serviceable pincode to continue'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">🔒 Safe and Secure Checkout</p>
          </div>

        </div>
      </div>
    </Layout>
  );
}
