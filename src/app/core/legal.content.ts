/**
 * Plain-language legal text for LagosPages.
 *
 * IMPORTANT: this is a well-structured starting template written from how the app actually works. It is not legal
 * advice. Fill in the COMPANY details below, then have a Nigerian lawyer review it before you take real payments.
 */

export const LEGAL = {
  /** Your registered business name. Replace before launch. */
  company: '[Your registered company name]',
  brand: 'LagosPages',
  site: 'lagospages.ng',
  address: '[Your business address], Lagos, Nigeria',
  email: 'support@lagospages.ng',
  /** The date these documents take effect. Update whenever you change them. */
  effective: '9 November 2026',
};

export type Block = string | { list: string[] };

export interface Section {
  id: string;
  title: string;
  body: Block[];
}

export interface LegalDoc {
  key: 'terms' | 'privacy' | 'refunds';
  title: string;
  lead: string;
  sections: Section[];
}

const L = LEGAL;

export const TERMS: LegalDoc = {
  key: 'terms',
  title: 'Terms of Use',
  lead: `These terms are the agreement between you and ${L.company} ("${L.brand}", "we", "us") for using ${L.site}. By creating an account or using the service you agree to them.`,
  sections: [
    {
      id: 'service',
      title: 'What LagosPages is',
      body: [
        `${L.brand} gives businesses in Nigeria a page of their own where customers can book appointments, order products and pay deposits online. We provide the software. We are not the seller of any product or service shown on a business page.`,
        'When a customer books or orders, the agreement is between that customer and the business. We are not a party to it and we do not guarantee any business, product, service, price or availability.',
      ],
    },
    {
      id: 'accounts',
      title: 'Your account',
      body: [
        {
          list: [
            'You must be at least 18 and able to enter a contract in Nigeria.',
            'Give accurate details, including a phone number you control. We verify it with a code sent by SMS.',
            'Keep your password and codes private. You are responsible for what happens under your account. Tell us at once if you think someone else has access.',
            'One person or business should not run many accounts to avoid limits or fees.',
          ],
        },
      ],
    },
    {
      id: 'owners',
      title: 'If you are a business owner',
      body: [
        'You are responsible for everything on your page: your products, services, prices, photos, opening hours and descriptions. They must be true and you must be able to deliver what you list.',
        'You must honour confirmed bookings and orders, handle customer complaints, and follow the laws that apply to your business, including tax, consumer protection and any licences you need.',
        'You decide your own deposit and cancellation rules and you must be clear about them on your page. Deposits are paid by customers directly to your bank account through our payment partner (Paystack or Payaza). We never hold your money.',
      ],
    },
    {
      id: 'customers',
      title: 'If you are a customer',
      body: [
        'You can book or order without an account. You must give a real name and phone number so the business can reach you. A booking is held for 10 minutes while you pay a deposit. If you do not pay in time, the hold ends and the time may be given to someone else.',
        'Refunds, rescheduling and complaints are handled by the business you booked with. See our Refund Policy for how deposits and plan payments work.',
      ],
    },
    {
      id: 'plans',
      title: 'Plans and payments',
      body: [
        {
          list: [
            'There is a Free plan and paid plans. Current prices and limits are on our pricing page. We may change them. A change never affects a period you have already paid for.',
            'A paid plan lasts 30 days from payment. It does not renew by itself. We may remind you before it ends. If it ends, your page stays online and you go back to the Free plan limits. Your data is kept.',
            'Plan payments are made through our payment partner (Paystack or Payaza). Processing fees on deposits are set by that partner, not by us.',
            'We may charge a small platform fee on deposits in the future. If we do, we will tell you in advance and show it in the app.',
          ],
        },
      ],
    },
    {
      id: 'rules',
      title: 'What you must not do',
      body: [
        {
          list: [
            'Sell or promote anything illegal, counterfeit, stolen, dangerous or fraudulent, or anything that exploits or harms others.',
            'Upload content you do not have the right to use, or content that is hateful, threatening, sexually explicit or misleading.',
            'Collect customer details for any purpose other than running your bookings and orders, or use them to spam people.',
            'Try to break, overload, scrape or get around the security of the service, or use it to commit fraud or money laundering.',
          ],
        },
      ],
    },
    {
      id: 'content',
      title: 'Your content',
      body: [
        'You keep ownership of what you upload (photos, descriptions, logos). You give us permission to store it, display it on your page and in your dashboard, and process it to run the service.',
      ],
    },
    {
      id: 'suspension',
      title: 'Suspension and ending your account',
      body: [
        'You can stop using the service at any time and ask us to delete your account. We can suspend or close an account, or remove content, if you break these terms, if we receive a credible complaint, if the law requires it, or to protect customers. Where we can, we will tell you why.',
      ],
    },
    {
      id: 'liability',
      title: 'Availability and our responsibility',
      body: [
        'We work to keep the service running but we cannot promise it will always be available or free of errors. Messages can be delayed by phone networks and payment providers outside our control.',
        'To the extent the law allows, we are not liable for lost profits, lost bookings, or indirect losses, or for what a business or customer does or fails to do. Our total liability to you for any claim is limited to the amount you paid us for your plan in the 3 months before the claim.',
        'Nothing in these terms limits any right you have under Nigerian law that cannot be limited.',
      ],
    },
    {
      id: 'law',
      title: 'Changes, law and contact',
      body: [
        'We may update these terms. If a change matters, we will tell you in the app or by SMS or email. Using the service after the change means you accept it.',
        'These terms are governed by the laws of the Federal Republic of Nigeria. Disputes go to the courts of Lagos State, after we have first tried to settle them in good faith.',
        `Questions: ${L.email}. Registered address: ${L.address}.`,
      ],
    },
  ],
};

export const PRIVACY: LegalDoc = {
  key: 'privacy',
  title: 'Privacy Policy',
  lead: `This explains what personal information ${L.company} ("${L.brand}", "we") collects through ${L.site}, why, and the choices you have. We handle personal data in line with the Nigeria Data Protection Act 2023.`,
  sections: [
    {
      id: 'collect',
      title: 'What we collect',
      body: [
        {
          list: [
            'Business owners: phone number, email (if you add one), a hashed password (we never store it in plain text), business name, page address, description, logo and photos, opening hours, WhatsApp and Instagram details, and a bank account name and the last 4 digits of the account number for payouts.',
            'Customers: the name, phone number, optional email and notes you enter when you book or order, plus the booking or order details.',
            'Payments: payment references, amounts and status. We do not see or store your card number, PIN or bank login.',
            'Technical data: IP address, device and browser type, and basic usage logs for security and fixing errors.',
          ],
        },
      ],
    },
    {
      id: 'use',
      title: 'Why we use it',
      body: [
        {
          list: [
            'To create and run accounts, and to verify phone numbers and emails with one-time codes.',
            'To let customers book and order, and to pass their details to the business they chose so it can serve them.',
            'To take and match payments, send confirmations and reminders, and give owners their dashboard and analytics.',
            'To keep the service safe, prevent fraud and abuse, and follow the law.',
          ],
        },
        'We do not sell personal data, and we do not use it for advertising by other companies.',
      ],
    },
    {
      id: 'share',
      title: 'Who we share it with',
      body: [
        'Only with the services we need to run the product, each under their own terms:',
        {
          list: [
            'The business a customer booked or ordered from. They receive that customer\'s name, phone and order details and are responsible for how they use them.',
            'Paystack or Payaza, for payments and bank account checks.',
            'Our SMS provider (Termii) and email provider (Resend), to deliver codes and messages.',
            'Cloudinary, to store images.',
            'Our cloud and database hosts (MongoDB Atlas and our application and website hosts).',
            'The authorities, where the law requires it.',
          ],
        },
        'Some of these providers store data outside Nigeria. We choose providers that protect it appropriately.',
      ],
    },
    {
      id: 'cookies',
      title: 'Cookies and local storage',
      body: [
        'We use one essential cookie to keep you logged in. It is secure and cannot be read by page scripts. We also store a small flag in your browser to remember that you are signed in. We do not use advertising or tracking cookies.',
      ],
    },
    {
      id: 'keep',
      title: 'How long we keep it',
      body: [
        'We keep account data while your account is open. Booking, order and payment records are kept as long as needed for accounting, disputes and legal duties. One-time codes expire within minutes and are deleted. When you ask us to delete your account we remove or anonymise your personal data, except what we must keep by law.',
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      body: [
        'You can ask to see the personal data we hold about you, correct it, have it deleted, restrict or object to how it is used, or receive a copy. You can withdraw consent where we rely on it. To do any of this, write to us at the address below. We will answer within a reasonable time.',
        'If you are unhappy with how we handle your data, you can complain to the Nigeria Data Protection Commission.',
      ],
    },
    {
      id: 'security',
      title: 'Security and children',
      body: [
        'We protect data with encrypted connections, hashed passwords, limits on login attempts and restricted access. No system is perfectly secure, so use a strong password and keep your codes private. Tell us at once if you suspect a problem.',
        'The service is not for people under 18, and we do not knowingly collect their data.',
      ],
    },
    {
      id: 'contact',
      title: 'Changes and contact',
      body: [
        'We will update this policy when our practices change and show the date at the top. For important changes we will tell you in the app or by SMS or email.',
        `Contact us: ${L.email}. ${L.company}, ${L.address}.`,
      ],
    },
  ],
};

export const REFUNDS: LegalDoc = {
  key: 'refunds',
  title: 'Refund Policy',
  lead: `How refunds work on ${L.brand}. There are two kinds of payment, and they are handled differently.`,
  sections: [
    {
      id: 'deposits',
      title: 'Booking deposits and orders (paid to a business)',
      body: [
        `When you pay a deposit to a business, the money goes from you to that business's bank account through our payment partner (Paystack or Payaza). ${L.brand} never holds it, so the business decides whether to refund it.`,
        {
          list: [
            'Check the business\'s cancellation and deposit rules on its page before you pay.',
            'To cancel, reschedule or ask for a refund, contact the business directly. Its WhatsApp and phone number are on your booking confirmation.',
            'Refunds are paid back by the business, usually to the account you paid from. How long it takes depends on the business and your bank.',
          ],
        },
        'If a business wrongly keeps your money or does not respond, contact us and we will try to help. We can pause the business\'s account while we look into it, but we cannot promise a refund that the business must make.',
      ],
    },
    {
      id: 'late',
      title: 'Paid after the 10-minute hold ended',
      body: [
        'A booking slot is held for 10 minutes while you pay. If your payment goes through after the hold ended and the time is still free, your booking is confirmed. If someone else has taken the time, the booking cannot be confirmed. The business is told your payment needs to be refunded and will return the deposit to you. Contact the business or us if you do not hear back.',
      ],
    },
    {
      id: 'plans',
      title: 'Plan payments (paid to LagosPages)',
      body: [
        {
          list: [
            'A paid plan lasts 30 days and does not renew automatically, so you are not charged again unless you choose to pay.',
            'Plan payments are non-refundable once the plan is active, because the features are available to you straight away.',
            'If you were charged twice, charged the wrong amount, or paid but your plan did not activate, contact us with your payment reference within 14 days. We will fix it or refund the extra charge.',
            'If we suspend your account because of a fault on our side, we will add the lost days back to your plan.',
          ],
        },
      ],
    },
    {
      id: 'fees',
      title: 'Processing fees',
      body: [
        'Our payment partner may charge a processing fee on payments. Fees already taken are set by the partner and are usually not returned when a payment is refunded. The business or we will tell you if this affects your refund.',
      ],
    },
    {
      id: 'contact',
      title: 'How to reach us',
      body: [
        `For a plan payment problem or a business that is not responding, email ${L.email} with your phone number, the payment reference (starts with "SUB" for plans) or booking code, and a short description. We aim to reply within 2 working days.`,
      ],
    },
  ],
};

export const DOCS: Record<LegalDoc['key'], LegalDoc> = { terms: TERMS, privacy: PRIVACY, refunds: REFUNDS };