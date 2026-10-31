export type HelpAudience = "customer" | "driver" | "business";

export type HelpFaq = {
  id: string;
  question: string;
  answer: string;
};

export type HelpSupportConfig = {
  faqs: Record<HelpAudience, HelpFaq[]>;
  contact: {
    phone: string;
    email: string;
    serviceArea: string;
    hours: string;
  };
};

export const HELP_SUPPORT_SETTING_KEY = "help_support";

const DEFAULT_FAQS: Record<HelpAudience, HelpFaq[]> = {
  customer: [
    { id: "customer-book-ride", question: "How do I book a ride?", answer: "Choose Shared Ride or Private Ride, enter your pickup and destination, review the fare, then send your request. The fare is shown before you confirm." },
    { id: "customer-fare", question: "How is my ride fare calculated?", answer: "The fare depends on the ride type, trip distance, and the selected terminal's current rates. Review the estimate in the app before confirming your request." },
    { id: "customer-food-order", question: "How do I order food?", answer: "Choose a restaurant, add items to your cart, select a delivery address, and review the total before placing your order." },
    { id: "customer-food-payment", question: "How do I pay for a food order?", answer: "Pay the food subtotal through GCash. The delivery fee is paid in cash to the rider when the order arrives." },
    { id: "customer-track-trip", question: "Where can I follow my ride or delivery?", answer: "Open Activity to see your rides and food orders. Select an item to view its details and available progress updates." },
    { id: "customer-cancel", question: "Can I cancel a ride or food order?", answer: "Open the item from Activity and use Cancel if that option is available. Cancellation depends on the current status. If you cannot cancel in the app, contact support with the ride or order details." },
    { id: "customer-order-problem", question: "What should I do if my order is wrong or missing something?", answer: "Open the order details and contact the restaurant or support. Include your order number and a description of the issue so it can be checked." },
    { id: "customer-account", question: "How do I update my account details?", answer: "Open Account and choose Edit profile to update your name, phone number, or profile photo." },
  ],
  driver: [
    { id: "driver-service-types", question: "How do I choose the requests I want to receive?", answer: "Open Service Types from your driver dashboard and turn on the ride or delivery services you offer." },
    { id: "driver-go-online", question: "How do I receive requests?", answer: "Go online from your driver dashboard and keep the matching service type enabled. Requests for your services will appear in the app." },
    { id: "driver-ride-queue", question: "Why can't I accept a shared or private ride?", answer: "Ride acceptance is limited to the first driver in your terminal queue. Make sure an admin has assigned you to a terminal and that you have joined its queue." },
    { id: "driver-delivery-request", question: "How do I receive food delivery requests?", answer: "Enable Delivery in Service Types, then go online. Matching delivery requests appear in the requests list and do not use the ride queue." },
    { id: "driver-trip-progress", question: "How do I update a ride or delivery's progress?", answer: "After accepting a request, use the Active Ride screen and follow its status actions as you complete each step." },
    { id: "driver-earnings", question: "Where can I see my completed trips and earnings?", answer: "Open Earnings from the driver app to review your trip and earnings summaries." },
    { id: "driver-assignment", question: "What if I am not assigned to a terminal?", answer: "Ask your Super Admin or terminal administrator to assign you. A terminal assignment is required before you can accept shared and private rides." },
  ],
  business: [
    { id: "business-orders", question: "Where can I view new customer orders?", answer: "Open Orders in your business app to review incoming orders and their current status." },
    { id: "business-gcash-confirmation", question: "How do I confirm a GCash payment?", answer: "Open the order, review the attached payment proof, and confirm the payment before starting food preparation." },
    { id: "business-order-status", question: "How do I update an order's status?", answer: "Use the actions on the order to start preparing it and mark it ready. The rider updates delivery progress after pickup." },
    { id: "business-menu", question: "How do I update my menu?", answer: "Open Menu in the business app to manage the items customers can order from your shop." },
    { id: "business-delivery-fee", question: "How is the delivery fee collected?", answer: "Customers pay the delivery fee in cash to the rider. The food subtotal is paid through GCash." },
    { id: "business-profile", question: "Where can I update my shop information?", answer: "Open your business account or profile to review and update your shop details and contact information." },
    { id: "business-support-order", question: "How do I get help with a specific order?", answer: "Contact support using the details below and include the order number, your shop name, and a short description of the issue." },
  ],
};

const DEFAULT_CONTACT: HelpSupportConfig["contact"] = {
  phone: "0917 123 4567",
  email: "help@trikeserve.app",
  serviceArea: "Gen. T. de Leon, Valenzuela City",
  hours: "7:00 AM-10:00 PM, daily",
};

export function createDefaultHelpSupportConfig(): HelpSupportConfig {
  return {
    faqs: {
      customer: DEFAULT_FAQS.customer.map((faq) => ({ ...faq })),
      driver: DEFAULT_FAQS.driver.map((faq) => ({ ...faq })),
      business: DEFAULT_FAQS.business.map((faq) => ({ ...faq })),
    },
    contact: { ...DEFAULT_CONTACT },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseSetting(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeFaqList(value: unknown, fallback: HelpFaq[]): HelpFaq[] {
  if (!Array.isArray(value)) return fallback.map((faq) => ({ ...faq }));
  return value.flatMap((entry, index) => {
    const faq = asRecord(entry);
    const question = typeof faq?.question === "string" ? faq.question.trim() : "";
    const answer = typeof faq?.answer === "string" ? faq.answer.trim() : "";
    if (!question || !answer) return [];
    return [{
      id: typeof faq?.id === "string" && faq.id.trim() ? faq.id : `faq-${index + 1}`,
      question,
      answer,
    }];
  });
}

export function normalizeHelpSupportConfig(value: unknown): HelpSupportConfig {
  const root = asRecord(parseSetting(value));
  const rawFaqs = asRecord(root?.faqs);
  const rawContact = asRecord(root?.contact);
  const defaults = createDefaultHelpSupportConfig();
  const contactValue = (key: keyof HelpSupportConfig["contact"]) =>
    typeof rawContact?.[key] === "string" ? (rawContact[key] as string).trim() : defaults.contact[key];

  return {
    faqs: {
      customer: normalizeFaqList(rawFaqs?.customer, defaults.faqs.customer),
      driver: normalizeFaqList(rawFaqs?.driver, defaults.faqs.driver),
      business: normalizeFaqList(rawFaqs?.business, defaults.faqs.business),
    },
    contact: {
      phone: contactValue("phone"),
      email: contactValue("email"),
      serviceArea: contactValue("serviceArea"),
      hours: contactValue("hours"),
    },
  };
}
