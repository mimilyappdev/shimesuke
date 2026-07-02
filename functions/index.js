const { onCall, onRequest } = require('firebase-functions/v2/https');
const { defineSecret }      = require('firebase-functions/params');
const admin  = require('firebase-admin');
const Stripe = require('stripe');

admin.initializeApp();

const STRIPE_SECRET_KEY     = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// TODO: Stripeダッシュボード → 商品 → 価格ID（price_xxxxx）を設定
const PRICE_IDS = {
  monthly: 'price_1Tnu64RXW1evPVMUvua7DIeK', // ¥380/月
  annual:  'price_1Tnu7mRXW1evPVMUYnS0vJu1', // ¥2,480/年
};

// TODO: アプリの公開URLに変更
const APP_URL = 'https://mimilyapp.web.app/pro';

/* ─────────────────────────────────────────
   チェックアウトセッション作成
   HTML側から firebase.functions().httpsCallable('createCheckoutSession') で呼ぶ
───────────────────────────────────────── */
exports.createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], region: 'asia-northeast1' },
  async (request) => {
    if (!request.auth) throw new Error('unauthenticated');

    const { plan } = request.data;
    const uid      = request.auth.uid;
    const email    = request.auth.token.email;

    if (!PRICE_IDS[plan]) throw new Error('invalid plan');

    const stripe  = new Stripe(STRIPE_SECRET_KEY.value());
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      customer_email: email,
      client_reference_id: uid,  // ← Webhook側でFirestore更新に使う
      success_url: `${APP_URL}?checkout=success`,
      cancel_url:  `${APP_URL}?checkout=cancel`,
      locale: 'ja',
    });

    return { url: session.url };
  }
);

/* ─────────────────────────────────────────
   Stripe Webhook受信
   StripeダッシュボードでこのURLをWebhookエンドポイントに登録する
   購読イベント: checkout.session.completed / customer.subscription.deleted
───────────────────────────────────────── */
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], region: 'asia-northeast1' },
  async (req, res) => {
    const sig    = req.headers['stripe-signature'];
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    const db = admin.firestore();

    try {
      switch (event.type) {

        case 'checkout.session.completed': {
          const session = event.data.object;
          const uid     = session.client_reference_id;
          if (uid) {
            await db.collection('users').doc(uid).set({
              isPro:            true,
              stripeCustomerId: session.customer,
              subscriptionId:   session.subscription,
              updatedAt:        admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`isPro: true → uid=${uid}`);
          }
          break;
        }

        case 'customer.subscription.deleted': {
          const sub      = event.data.object;
          const snapshot = await db.collection('users')
            .where('stripeCustomerId', '==', sub.customer)
            .limit(1)
            .get();
          if (!snapshot.empty) {
            await snapshot.docs[0].ref.set({
              isPro:     false,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log(`isPro: false → customer=${sub.customer}`);
          }
          break;
        }
      }
    } catch (err) {
      console.error('Firestore update error:', err);
      res.status(500).send('Internal error');
      return;
    }

    res.json({ received: true });
  }
);
