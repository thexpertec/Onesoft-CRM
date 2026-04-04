import React, { useState, useEffect, useCallback } from "react";
import { Calendar, ChevronDown, Building2, User, Globe, Phone, Mail, Briefcase, Target, Layers, Clock, DollarSign, Wrench, FileText, CheckSquare, Tag, MapPin, PenLine, Monitor, Heart, GraduationCap, ShoppingCart, Truck, Scale, Home, Cloud, UtensilsCrossed, Hammer, Palette, CreditCard, BookOpen, Zap, Shield, Factory, Brain, Car, Handshake, Check, Save } from "lucide-react";
import onesoftLogo from "@assets/Onesoft_Logo_1775302706939.png";
import RichTextEditor from "@/components/RichTextEditor";

const TEAM_MEMBERS = [
  "Alice Johnson",
  "Bob Martinez",
  "Clara Chen",
  "David Kim",
  "Emma Patel",
  "Frank Nguyen",
];

const CLIENTS = [
  { name: "TechNova Solutions",   phone: "+44 113 555 0182", email: "contact@technovasolutions.co.uk",      company: "TechNova Solutions Ltd.",              industry: "Software & Technology",        website: "www.technovasolutions.co.uk",      address: "14 Kirkgate",             city: "Leeds",       county: "West Yorkshire",    postcode: "LS1 6BY" },
  { name: "CloudMind Systems",    phone: "+44 161 555 0293", email: "hello@cloudmindsystems.co.uk",          company: "CloudMind Systems Ltd.",               industry: "Cloud & IT Services",          website: "www.cloudmindsystems.co.uk",      address: "22 Piccadilly",           city: "Manchester",  county: "Greater Manchester", postcode: "M1 2AN" },
  { name: "DataSphere Analytics", phone: "+44 207 555 0374", email: "info@dataspherehq.co.uk",              company: "DataSphere Analytics Ltd.",            industry: "Data & AI",                    website: "www.dataspherehq.co.uk",          address: "88 Bishopsgate",          city: "London",      county: "Greater London",    postcode: "EC2N 4AG" },
  { name: "DevBridge UK",         phone: "+44 113 555 0491", email: "projects@devbridgeuk.com",             company: "DevBridge UK Ltd.",                    industry: "Software Development",         website: "www.devbridgeuk.com",             address: "5 Park Row",              city: "Leeds",       county: "West Yorkshire",    postcode: "LS1 5HD" },
  { name: "GreenPath Retail",     phone: "+44 20 555 0347",  email: "hello@greenpathretail.co.uk",          company: "GreenPath Retail Ltd.",                industry: "E-commerce & Retail",          website: "www.greenpathretail.co.uk",       address: "12 Oxford Street",        city: "London",      county: "Greater London",    postcode: "W1D 1BS" },
  { name: "QuickCart Online",     phone: "+44 161 555 0512", email: "ops@quickcartonline.co.uk",            company: "QuickCart Online Ltd.",                industry: "E-commerce",                   website: "www.quickcartonline.co.uk",       address: "30 Deansgate",            city: "Manchester",  county: "Greater Manchester", postcode: "M3 2EQ" },
  { name: "HomeStyle Shop",       phone: "+44 113 555 0638", email: "sales@homestyleshop.co.uk",            company: "HomeStyle Retail Ltd.",                industry: "Home & Lifestyle Retail",      website: "www.homestyleshop.co.uk",         address: "7 Boar Lane",             city: "Leeds",       county: "West Yorkshire",    postcode: "LS1 6HW" },
  { name: "FreshBite Catering",   phone: "+44 113 555 0719", email: "enquiries@freshbitecatering.co.uk",    company: "FreshBite Catering Services Ltd.",     industry: "Food & Hospitality",           website: "www.freshbitecatering.co.uk",     address: "19 Albion Street",        city: "Leeds",       county: "West Yorkshire",    postcode: "LS2 8PN" },
  { name: "HotelPro Management",  phone: "+44 207 555 0834", email: "info@hotelpromgmt.co.uk",              company: "HotelPro Management Group",            industry: "Hospitality & Tourism",        website: "www.hotelpromgmt.co.uk",          address: "45 Park Lane",            city: "London",      county: "Greater London",    postcode: "W1K 7QZ" },
  { name: "HealthFirst Clinics",  phone: "+44 114 555 0293", email: "info@healthfirstclinics.co.uk",        company: "HealthFirst Medical Group Ltd.",       industry: "Healthcare & Wellness",        website: "www.healthfirstclinics.co.uk",    address: "3 Pinstone Street",       city: "Sheffield",   county: "South Yorkshire",   postcode: "S1 2HN" },
  { name: "MediTrack Systems",    phone: "+44 207 555 0917", email: "support@meditracksys.co.uk",           company: "MediTrack Systems Ltd.",               industry: "Healthcare Technology",        website: "www.meditracksys.co.uk",          address: "200 Aldersgate Street",   city: "London",      county: "Greater London",    postcode: "EC1A 4HD" },
  { name: "CarePoint Services",   phone: "+44 113 555 0128", email: "admin@carepointservices.co.uk",        company: "CarePoint Community Services",         industry: "Social Care & NHS",            website: "www.carepointservices.co.uk",     address: "62 Wellington Street",    city: "Leeds",       county: "West Yorkshire",    postcode: "LS1 2EE" },
  { name: "FinEdge Capital",      phone: "+44 207 555 0418", email: "team@finedgecapital.co.uk",            company: "FinEdge Capital Partners Ltd.",        industry: "Financial Services",           website: "www.finedgecapital.co.uk",        address: "1 Canada Square",         city: "London",      county: "Greater London",    postcode: "E14 5AB" },
  { name: "PaySmart UK",          phone: "+44 207 555 0563", email: "hello@paysmartuk.com",                 company: "PaySmart Financial Tech Ltd.",         industry: "Fintech & Payments",           website: "www.paysmartuk.com",              address: "25 Bank Street",          city: "London",      county: "Greater London",    postcode: "E14 5JP" },
  { name: "SmartInvest Advisors", phone: "+44 161 555 0684", email: "contact@smartinvestadvisors.co.uk",    company: "SmartInvest Financial Advisors",       industry: "Wealth Management",            website: "www.smartinvestadvisors.co.uk",   address: "8 St Mary's Parsonage",   city: "Manchester",  county: "Greater Manchester", postcode: "M3 2ER" },
  { name: "LearnHub Academy",     phone: "+44 113 555 0745", email: "info@learnhubacademy.co.uk",           company: "LearnHub Education Ltd.",              industry: "Education & E-learning",       website: "www.learnhubacademy.co.uk",       address: "4 Merrion Way",           city: "Leeds",       county: "West Yorkshire",    postcode: "LS2 8BT" },
  { name: "EduTrack School",      phone: "+44 114 555 0821", email: "admin@edutrackschool.co.uk",           company: "EduTrack School Solutions Ltd.",       industry: "Education Technology",         website: "www.edutrackschool.co.uk",        address: "15 Leopold Street",       city: "Sheffield",   county: "South Yorkshire",   postcode: "S1 2GY" },
  { name: "SkillUp Training",     phone: "+44 161 555 0936", email: "courses@skilluptraining.co.uk",        company: "SkillUp Training & Development Ltd.",  industry: "Corporate Training",           website: "www.skilluptraining.co.uk",       address: "11 Portland Street",      city: "Manchester",  county: "Greater Manchester", postcode: "M1 3HU" },
  { name: "LegalEase Solicitors", phone: "+44 207 555 0247", email: "enquiries@legaleasesolicitors.co.uk",  company: "LegalEase Solicitors LLP",             industry: "Legal Services",               website: "www.legaleasesolicitors.co.uk",   address: "60 Gray's Inn Road",      city: "London",      county: "Greater London",    postcode: "WC1X 8LU" },
  { name: "CompliancePro UK",     phone: "+44 161 555 0358", email: "info@complianceprouk.com",             company: "CompliancePro Advisory Ltd.",          industry: "Compliance & Risk",            website: "www.complianceprouk.com",         address: "3 Hardman Square",        city: "Manchester",  county: "Greater Manchester", postcode: "M3 3EB" },
  { name: "PropTrack Estates",    phone: "+44 113 555 0469", email: "sales@proptrackes.co.uk",              company: "PropTrack Property Solutions",         industry: "Property & Real Estate",       website: "www.proptrackestates.co.uk",      address: "9 Bond Court",            city: "Leeds",       county: "West Yorkshire",    postcode: "LS1 2JZ" },
  { name: "HomeFinder UK",        phone: "+44 207 555 0572", email: "hello@homefinderuk.com",               company: "HomeFinder UK Ltd.",                   industry: "Property Technology",          website: "www.homefinderuk.com",            address: "16 Upper Woburn Place",   city: "London",      county: "Greater London",    postcode: "WC1H 0AF" },
  { name: "SwiftMove Logistics",  phone: "+44 113 555 0681", email: "ops@swiftmovelogistics.co.uk",         company: "SwiftMove Logistics Ltd.",             industry: "Logistics & Delivery",         website: "www.swiftmovelogistics.co.uk",    address: "Unit 5 Gelderd Road",     city: "Leeds",       county: "West Yorkshire",    postcode: "LS12 6DT" },
  { name: "RouteOptima",          phone: "+44 161 555 0793", email: "contact@routeoptima.co.uk",            company: "RouteOptima Fleet Solutions Ltd.",     industry: "Fleet & Transport",            website: "www.routeoptima.co.uk",           address: "18 Trafford Park Road",   city: "Manchester",  county: "Greater Manchester", postcode: "M17 1EE" },
  { name: "PrecisionParts Ltd",   phone: "+44 114 555 0804", email: "enquiries@precisionpartsltd.co.uk",    company: "PrecisionParts Manufacturing Ltd.",    industry: "Manufacturing & Engineering",  website: "www.precisionpartsltd.co.uk",     address: "27 Attercliffe Road",     city: "Sheffield",   county: "South Yorkshire",   postcode: "S4 7WW" },
  { name: "BuildRight Construction", phone: "+44 113 555 0915", email: "projects@buildrightconstruction.co.uk", company: "BuildRight Construction Group",   industry: "Construction & Civil Engineering", website: "www.buildrightconstruction.co.uk", address: "40 Armley Road",        city: "Leeds",       county: "West Yorkshire",    postcode: "LS12 2EJ" },
  { name: "GreenEnergy Partners", phone: "+44 207 555 0136", email: "info@greenenergypartners.co.uk",       company: "GreenEnergy Solutions Ltd.",           industry: "Energy & Utilities",           website: "www.greenenergypartners.co.uk",   address: "10 Victoria Street",      city: "London",      county: "Greater London",    postcode: "SW1H 0NN" },
  { name: "SafeGuard Security",   phone: "+44 161 555 0247", email: "ops@safeguardsecurity.co.uk",          company: "SafeGuard Security Services Ltd.",     industry: "Security & Surveillance",      website: "www.safeguardsecurity.co.uk",     address: "55 Mosley Street",        city: "Manchester",  county: "Greater Manchester", postcode: "M2 3AZ" },
  { name: "BrightMind Charity",   phone: "+44 113 555 0358", email: "hello@brightmindcharity.org.uk",       company: "BrightMind Community Foundation",      industry: "Non-profit & Charity",         website: "www.brightmindcharity.org.uk",    address: "6 St Paul's Street",      city: "Leeds",       county: "West Yorkshire",    postcode: "LS1 2LE" },
  { name: "MediaWave Studio",     phone: "+44 207 555 0469", email: "creative@mediawaveuk.co.uk",           company: "MediaWave Creative Studio Ltd.",       industry: "Media & Creative Agency",      website: "www.mediawaveuk.co.uk",           address: "32 Clerkenwell Close",    city: "London",      county: "Greater London",    postcode: "EC1R 0AT" },
];

const BUSINESS_TYPES = [
  "Services",
  "Products",
  "Both (Services & Products)",
  "B2B",
  "B2C",
  "B2B2C",
  "SaaS",
  "Marketplace",
  "E-commerce",
  "Healthcare",
  "Education",
  "Finance & Fintech",
  "Logistics & Transport",
  "Construction & Property",
  "Hospitality & Tourism",
  "Manufacturing",
  "Non-profit",
  "Government",
  "Media & Creative",
  "Other",
];

const PRODUCTS_BY_TYPE: Record<string, string[]> = {
  Services: [
    "IT Consulting",
    "Software Development",
    "Web Development",
    "Mobile App Development",
    "Cloud & DevOps Services",
    "Cybersecurity & Information Security",
    "UI/UX Design",
    "Digital Marketing",
    "SEO & Content Strategy",
    "Social Media Management",
    "Data Analytics & Business Intelligence",
    "AI & Machine Learning Services",
    "Business Process Outsourcing (BPO)",
    "Customer Support & Help Desk",
    "Legal & Compliance Services",
    "Accounting & Bookkeeping",
    "Payroll Services",
    "HR & Recruitment",
    "Corporate Training & L&D",
    "Project Management",
    "QA & Testing Services",
    "Managed IT Services",
    "Network & Infrastructure Services",
    "Technical Support",
    "Business Consultancy",
    "Brand Strategy & Design",
    "Photography & Videography",
    "Translation & Localisation",
    "Research & Market Analysis",
    "Event Management",
  ],
  Products: [
    "SaaS Platform",
    "Mobile Application (iOS & Android)",
    "Web Application / Portal",
    "Desktop Software",
    "API / SDK / Developer Tools",
    "CRM Software",
    "ERP Software",
    "E-commerce Platform",
    "Point of Sale (POS) System",
    "Inventory Management System",
    "Warehouse Management System",
    "HR Management System (HRMS)",
    "Payroll Software",
    "Accounting & Finance Software",
    "Project Management Tool",
    "Collaboration & Communication Tool",
    "Analytics & Reporting Platform",
    "AI / Chatbot Product",
    "LMS (Learning Management System)",
    "Booking & Scheduling Software",
    "Subscription Management Platform",
    "IoT Device / Smart Product",
    "Hardware Device",
    "Physical Retail Product",
    "Digital Downloads / Content",
    "Subscription Box",
    "Wearable Technology",
    "Security / Surveillance Equipment",
    "Printed Materials / Stationery",
    "Branded Merchandise",
  ],
  SaaS: [
    "SaaS Platform",
    "Web Application / Portal",
    "Mobile Application (iOS & Android)",
    "API / SDK / Developer Tools",
    "CRM Software",
    "ERP Software",
    "HR Management System (HRMS)",
    "Payroll Software",
    "Accounting & Finance Software",
    "Project Management Tool",
    "Collaboration & Communication Tool",
    "Analytics & Reporting Platform",
    "AI / Chatbot Product",
    "LMS (Learning Management System)",
    "Booking & Scheduling Software",
    "Subscription Management Platform",
    "Customer Support Platform",
    "Marketing Automation Tool",
    "E-commerce Platform",
    "Document Management System",
  ],
  "E-commerce": [
    "Online Retail Store",
    "Product Catalogue & Listings",
    "Shopping Cart & Checkout",
    "Payment Gateway Integration",
    "Order Management System",
    "Inventory Management System",
    "Warehouse Management System",
    "Returns & Refunds Management",
    "Multi-currency & Multi-language Support",
    "Loyalty & Rewards Programme",
    "Discount & Coupon Engine",
    "Product Reviews & Ratings",
    "Wishlist & Favourites",
    "Personalised Recommendations",
    "Email Marketing & Newsletters",
    "Abandoned Cart Recovery",
    "Subscription / Recurring Orders",
    "B2B Wholesale Portal",
    "Click & Collect / In-store Pickup",
    "Delivery Tracking & Notifications",
  ],
  Marketplace: [
    "Multi-vendor / Multi-seller Platform",
    "Buyer & Seller Accounts",
    "Product Listings & Search",
    "Rating & Review System",
    "Escrow / Secure Payment",
    "Commission & Fee Management",
    "Dispute Resolution System",
    "Messaging & Negotiation",
    "Category & Taxonomy Management",
    "Verified Seller Badges",
    "Promoted Listings / Ads",
    "Subscription Plans for Sellers",
    "Analytics for Sellers",
    "Mobile Application (iOS & Android)",
    "API Integrations",
    "Fraud Detection",
    "Geo-location & Local Listings",
    "Logistics / Fulfilment Integration",
    "Digital Goods / Downloads",
    "Service Bookings & Appointments",
  ],
  B2B: [
    "B2B Sales Portal",
    "Trade Account Management",
    "Bulk / Wholesale Ordering",
    "Quote & RFQ System",
    "Invoice & Credit Terms Management",
    "Contract Management",
    "CRM Software",
    "ERP Software",
    "Supply Chain Management",
    "Procurement System",
    "Vendor / Supplier Portal",
    "Partner Portal",
    "API Integrations",
    "Lead Management",
    "Business Analytics & Reporting",
    "Account-Based Marketing Tools",
    "Service Level Agreement (SLA) Tracking",
    "Field Sales App",
    "Customer Onboarding System",
    "Document & Proposal Management",
  ],
  B2C: [
    "Consumer Mobile App (iOS & Android)",
    "E-commerce / Online Shop",
    "Loyalty & Rewards Programme",
    "Personalised Recommendations",
    "Push Notifications & Alerts",
    "Subscription / Membership",
    "Social Login (Google, Facebook, Apple)",
    "Wishlist & Favourites",
    "Review & Rating System",
    "Referral Programme",
    "Live Chat & Customer Support",
    "Coupons & Discounts",
    "Augmented Reality (AR) Try-on",
    "Delivery Tracking",
    "In-app Payments",
    "Content / Blog Platform",
    "User Profile & Account Management",
    "Gamification Features",
    "Gift Cards",
    "Multi-language & Multi-currency",
  ],
  Healthcare: [
    "Patient Management System (PMS)",
    "Electronic Health Records (EHR/EMR)",
    "Online Appointment Booking",
    "Telemedicine / Video Consultations",
    "Prescription Management",
    "Medical Billing & Invoicing",
    "Lab Results Portal",
    "Staff Scheduling & Rota",
    "Referral Management System",
    "GP / Clinic Website",
    "NHS Integration",
    "CQC Compliance Tools",
    "Patient Mobile App",
    "Health Monitoring / Wearable Integration",
    "Mental Health Platform",
    "Care Home Management Software",
    "Pharmacy Management System",
    "Diagnostic Imaging Platform",
    "Secure Messaging (Clinician-Patient)",
    "Medical Training & E-learning Platform",
  ],
  Education: [
    "LMS (Learning Management System)",
    "Student Information System (SIS)",
    "Online Course Platform",
    "Virtual Classroom / Live Lessons",
    "Assignment & Assessment Tools",
    "Progress Tracking & Reporting",
    "Parent & Guardian Portal",
    "School / College Website",
    "Admissions Management System",
    "Attendance Tracking",
    "Exam & Certification Platform",
    "Mobile Learning App",
    "Library Management System",
    "Fee & Invoice Management",
    "E-learning Content Creation Tools",
    "Gamified Learning Platform",
    "SEND (Special Educational Needs) Tools",
    "Staff & HR Portal",
    "Communication & Messaging Platform",
    "Alumni Network Portal",
  ],
  "Finance & Fintech": [
    "Banking / Neobank Platform",
    "Payment Gateway / Processing",
    "Open Banking Integration",
    "Digital Wallet",
    "Money Transfer & Remittance",
    "Accounting & Bookkeeping Software",
    "Invoice & Billing Platform",
    "Payroll Processing",
    "Expense Management Tool",
    "Financial Planning & Budgeting App",
    "Investment / Robo-advisor Platform",
    "Crypto / Blockchain Solution",
    "Loan & Credit Management",
    "KYC / AML Compliance Tools",
    "Financial Reporting & Analytics",
    "Fraud Detection System",
    "FCA-compliant Client Portal",
    "Insurance Platform",
    "Tax Filing & Self-assessment Tool",
    "Pension & Savings Platform",
  ],
  "Logistics & Transport": [
    "Fleet Management System",
    "Route Optimisation Software",
    "Delivery Tracking & Notifications",
    "Dispatch & Operations Platform",
    "Driver Mobile App",
    "Warehouse Management System (WMS)",
    "Order Management System",
    "Freight & Shipping Integration",
    "Last-Mile Delivery Solution",
    "Proof of Delivery (PoD) App",
    "Transport Management System (TMS)",
    "Vehicle Maintenance Tracker",
    "Customer Tracking Portal",
    "Load Board / Freight Marketplace",
    "Courier Booking Platform",
    "Cold Chain Monitoring",
    "Customs & Compliance Tools",
    "Real-time GPS Tracking",
    "Returns Management",
    "Automated Invoicing & Billing",
  ],
  "Construction & Property": [
    "Construction Project Management Software",
    "Site Management & Health & Safety App",
    "Quantity Surveying & Estimating Tools",
    "Tendering / RFQ Platform",
    "BIM (Building Information Modelling) Integration",
    "Subcontractor Management Portal",
    "Timesheet & Labour Tracking",
    "Document & Drawing Management",
    "Property Listing / Agency Website",
    "Landlord & Tenant Portal",
    "Property Management System",
    "Maintenance & Repairs Tracking",
    "Rent Collection & Payment System",
    "Property Valuation Tool",
    "CRM for Estate Agents",
    "Planning Permission Tracker",
    "Snagging & Defect Management App",
    "Client Reporting Portal",
    "Customer / Buyer Portal",
    "Sustainability & Energy Reporting",
  ],
  "Hospitality & Tourism": [
    "Hotel Property Management System (PMS)",
    "Online Booking Engine",
    "Channel Manager (OTA Integration)",
    "Restaurant Booking & Table Management",
    "Menu & QR Code Ordering System",
    "Kitchen Display System (KDS)",
    "Point of Sale (POS) for Hospitality",
    "Guest Experience App",
    "Housekeeping & Maintenance App",
    "Revenue Management System",
    "Loyalty & Membership Programme",
    "Tour & Activity Booking Platform",
    "Spa & Wellness Booking System",
    "Event & Conference Management",
    "Catering Management Software",
    "Staff Scheduling & Rota",
    "Customer Feedback & Reviews",
    "Gift Voucher System",
    "Accounting & Finance Integration",
    "Multi-property Management",
  ],
  Manufacturing: [
    "Manufacturing Execution System (MES)",
    "ERP for Manufacturing",
    "Quality Control & Inspection Software",
    "Inventory & Stock Management",
    "Supply Chain Management",
    "Production Planning & Scheduling",
    "Asset & Equipment Maintenance (CMMS)",
    "Bill of Materials (BOM) Management",
    "Shop Floor Management System",
    "Batch & Lot Tracking",
    "Supplier & Vendor Portal",
    "Warehouse Management System (WMS)",
    "Shipping & Dispatch Integration",
    "Customer Order Management",
    "Product Lifecycle Management (PLM)",
    "IoT / Machine Monitoring Integration",
    "Health & Safety Compliance App",
    "Reporting & Business Intelligence",
    "CAD / Engineering Integration",
    "Returns & Warranty Management",
  ],
  "Non-profit": [
    "Charity / NGO Website",
    "Online Donation Platform",
    "Fundraising Campaign Management",
    "Volunteer Management System",
    "Donor CRM",
    "Grant Management System",
    "Membership & Subscription Portal",
    "Event Management Platform",
    "Impact Reporting & Dashboard",
    "Gift Aid & Tax Relief Processing",
    "Email Marketing & Newsletter",
    "Social Media Integration",
    "Beneficiary Management System",
    "Case Management Software",
    "Advocacy & Petition Tools",
    "Community Forum / Portal",
    "Regular Giving / Direct Debit Management",
    "Legacy Giving Platform",
    "Merchandise / Charity Shop",
    "Compliance & Governance Tools",
  ],
  Government: [
    "Citizen Self-service Portal",
    "Online Application & Forms Platform",
    "Case Management System",
    "Document Management System",
    "Planning & Permitting Portal",
    "Council Website",
    "Freedom of Information (FOI) Management",
    "Grant Management Platform",
    "Housing & Benefits Portal",
    "Social Care & Children's Services System",
    "Licensing & Registration Platform",
    "Payments & Fees Collection",
    "Data & Reporting Dashboard",
    "Internal Staff Intranet",
    "HR & Workforce Management",
    "GDS / Accessibility Compliant Design",
    "Integration with Gov.uk Services",
    "Health & Safety Inspection App",
    "Asset & Facilities Management",
    "Community Engagement Platform",
  ],
  "Media & Creative": [
    "Agency / Portfolio Website",
    "Content Management System (CMS)",
    "Digital Asset Management (DAM)",
    "Video Streaming / On-demand Platform",
    "Podcast Platform",
    "Newsletter & Email Platform",
    "Social Media Scheduling Tool",
    "Influencer Management Platform",
    "Photo / Video Editing App",
    "Print Management System",
    "Event Ticketing Platform",
    "Client & Project Management Portal",
    "Online Store / Merchandise",
    "Subscription / Paywall",
    "Press & PR Distribution",
    "Brand Asset Library",
    "Interactive / Immersive Experience",
    "Music / Audio Platform",
    "E-book / Digital Publishing",
    "Advertising & Campaign Management",
  ],
};

const COMBINED_OPTIONS = Array.from(
  new Set([...PRODUCTS_BY_TYPE.Services, ...PRODUCTS_BY_TYPE.Products])
);

function getProductOptions(businessType: string): string[] {
  if (businessType === "Services") return PRODUCTS_BY_TYPE.Services;
  if (businessType === "Products") return PRODUCTS_BY_TYPE.Products;
  if (PRODUCTS_BY_TYPE[businessType]) return PRODUCTS_BY_TYPE[businessType];
  return COMBINED_OPTIONS;
}

const KEY_FEATURES_OPTIONS = [
  "Lead Management",
  "Customer CRM",
  "Payment Processing",
  "Analytics & Reporting",
  "User Roles & Permissions",
  "Email Notifications",
  "SMS Notifications",
  "Inventory Management",
  "Document Management",
  "API Integrations",
  "Mobile App",
  "Multi-language Support",
  "Audit Logs",
  "Custom Dashboards",
  "Real-time Chat",
  "Workflow Automation",
];

const HOSTING_OPTIONS = ["Cloud (AWS / Azure / GCP)", "On-premise", "Hybrid", "Managed Hosting", "Not Decided"];
const MAINTENANCE_OPTIONS = ["3 months", "6 months", "1 year", "2 years", "Ongoing"];
const PAYMENT_STRUCTURES = ["Fixed Price", "Hourly Rate", "Payment Milestones", "Retainer", "Time & Material"];

const INTEGRATIONS_OPTIONS = [
  // Payments & Finance
  "Stripe", "PayPal", "GoCardless", "Worldpay", "Sage Pay", "Square", "Braintree", "Klarna", "Xero", "QuickBooks", "Sage Accounting", "FreeAgent",
  // CRM & Sales
  "Salesforce", "HubSpot", "Pipedrive", "Zoho CRM", "Microsoft Dynamics 365", "Freshsales", "Monday CRM",
  // Marketing & Email
  "Mailchimp", "Klaviyo", "SendGrid", "Campaign Monitor", "ActiveCampaign", "Brevo (Sendinblue)", "Constant Contact", "Dotdigital",
  // Communication & Messaging
  "Twilio (SMS)", "Twilio (Voice)", "WhatsApp Business API", "Intercom", "Zendesk", "Freshdesk", "LiveChat", "Tawk.to",
  // Cloud & Storage
  "AWS S3", "Google Cloud Storage", "Azure Blob Storage", "Cloudinary", "Dropbox", "Google Drive", "OneDrive", "Box",
  // Authentication & Identity
  "Google OAuth", "Facebook Login", "Apple Sign-In", "Auth0", "Firebase Auth", "Okta", "Microsoft Azure AD",
  // Analytics & Tracking
  "Google Analytics 4", "Google Tag Manager", "Hotjar", "Mixpanel", "Amplitude", "Segment", "Heap", "Microsoft Clarity",
  // E-commerce & Retail
  "Shopify", "WooCommerce", "Magento", "BigCommerce", "Etsy API", "Amazon Seller API", "eBay API",
  // Logistics & Shipping
  "Royal Mail API", "DPD API", "Evri API", "DHL API", "FedEx API", "UPS API", "ShipStation", "EasyPost",
  // Maps & Location
  "Google Maps", "Mapbox", "What3Words", "Postcode Anywhere (PCA Predict)",
  // Social Media
  "Facebook / Meta API", "Instagram API", "Twitter / X API", "LinkedIn API", "TikTok API", "YouTube API",
  // ERP & Business Systems
  "SAP", "Oracle ERP", "Microsoft Dynamics NAV", "NetSuite",
  // HR & Payroll
  "BambooHR", "Workday", "ADP Payroll", "Sage HR", "Breathe HR",
  // Collaboration & Productivity
  "Slack", "Microsoft Teams", "Zoom", "Google Workspace", "Microsoft 365",
  // Healthcare
  "NHS Login", "EMIS Health", "SystmOne", "NHS Spine",
  // Other
  "Zapier", "Make (Integromat)", "n8n", "Webhooks / REST API", "GraphQL API",
];

const TECH_STACK_OPTIONS = [
  // Frontend Frameworks
  "React", "Next.js", "Vue.js", "Nuxt.js", "Angular", "Svelte", "SvelteKit", "Remix",
  // Mobile
  "React Native", "Expo", "Flutter", "Swift (iOS)", "Kotlin (Android)", "Ionic",
  // Backend / Server
  "Node.js", "Express.js", "NestJS", "Django", "FastAPI", "Flask", "Ruby on Rails", "Laravel (PHP)", "Spring Boot (Java)", "ASP.NET Core (C#)", "Go (Golang)", "Rust",
  // Databases — Relational
  "PostgreSQL", "MySQL", "MariaDB", "SQLite", "Microsoft SQL Server", "Oracle Database",
  // Databases — NoSQL
  "MongoDB", "Firebase Firestore", "DynamoDB", "Redis", "Cassandra",
  // Cloud Providers
  "AWS (Amazon Web Services)", "Google Cloud Platform (GCP)", "Microsoft Azure", "DigitalOcean", "Heroku", "Vercel", "Netlify", "Fly.io", "Railway",
  // DevOps & CI/CD
  "Docker", "Kubernetes", "GitHub Actions", "GitLab CI/CD", "Bitbucket Pipelines", "CircleCI", "Jenkins", "Terraform",
  // CMS & Headless CMS
  "WordPress", "Strapi", "Contentful", "Sanity", "Prismic", "Directus", "Payload CMS",
  // APIs & Protocols
  "REST API", "GraphQL", "gRPC", "WebSockets", "MQTT (IoT)",
  // AI & ML
  "OpenAI API (ChatGPT)", "Anthropic Claude API", "Google Gemini API", "Hugging Face", "LangChain", "TensorFlow", "PyTorch",
  // Search
  "Elasticsearch", "Algolia", "MeiliSearch", "Typesense",
  // Testing
  "Jest", "Cypress", "Playwright", "Vitest", "Selenium",
  // CSS & UI
  "Tailwind CSS", "Bootstrap", "Material UI (MUI)", "Chakra UI", "shadcn/ui", "Ant Design", "SASS / SCSS",
  // State Management
  "Redux", "Zustand", "Jotai", "React Query (TanStack Query)", "SWR",
  // Authentication
  "JWT (JSON Web Tokens)", "OAuth 2.0 / OpenID Connect", "Clerk", "NextAuth.js", "Passport.js",
  // Version Control
  "Git / GitHub", "GitLab", "Bitbucket",
];

function SectionHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
        <Icon className="w-4.5 h-4.5 text-primary" size={18} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
      {label}
      {required && <span className="text-primary ml-1">*</span>}
    </label>
  );
}

function TextInput({ placeholder, value, onChange, rows }: { placeholder?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  if (rows) {
    return (
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none"
      />
    );
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
    />
  );
}

function SelectInput({ options, value, onChange, placeholder }: { options: string[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-9"
      >
        <option value="" disabled>{placeholder || "Select an option"}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-9"
      />
      <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

function ReadOnlyField({ value, placeholder }: { value: string; placeholder?: string }) {
  return (
    <div className="w-full px-3 py-2.5 rounded-lg border border-border bg-muted/40 text-sm min-h-[42px]">
      {value ? (
        <span className="text-foreground">{value}</span>
      ) : (
        <span className="text-muted-foreground/50 italic">{placeholder || "Auto-populated"}</span>
      )}
    </div>
  );
}

function MultiSelectFeatures({
  selected,
  onChange,
  options = KEY_FEATURES_OPTIONS,
  placeholder = "Search and select...",
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  options?: string[];
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = options.filter(
    (f) => f.toLowerCase().includes(search.toLowerCase()) && !selected.includes(f)
  );

  const toggle = (feature: string) => {
    if (selected.includes(feature)) {
      onChange(selected.filter((f) => f !== feature));
    } else {
      onChange([...selected, feature]);
    }
  };

  return (
    <div className="space-y-2">
      <div
        className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-border bg-background flex flex-wrap gap-1.5 cursor-text focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all"
        onClick={() => setOpen(true)}
      >
        {selected.map((f) => (
          <span
            key={f}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
          >
            {f}
            <button
              onClick={(e) => { e.stopPropagation(); toggle(f); }}
              className="text-primary/60 hover:text-primary ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
        {selected.length === 0 && !open && (
          <span className="text-muted-foreground/60 text-sm italic">{placeholder}</span>
        )}
        {open && (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Type to search..."
            className="flex-1 min-w-24 text-sm outline-none bg-transparent text-foreground placeholder:text-muted-foreground/60"
          />
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden max-h-48 overflow-y-auto z-10 relative">
          {filtered.map((f) => (
            <button
              key={f}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { toggle(f); setSearch(""); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors flex items-center gap-2"
            >
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormField({ children, label, required, hint }: { children: React.ReactNode; label: string; required?: boolean; hint?: React.ReactNode }) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{hint}</p>}
    </div>
  );
}

function SaveButton({ sectionKey, saved, onSave }: { sectionKey: string; saved: boolean; onSave: () => void }) {
  return (
    <div className="flex justify-end mt-6 pt-4 border-t border-border">
      <button
        type="button"
        onClick={onSave}
        className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
          saved
            ? "bg-green-50 text-green-700 border border-green-200 shadow-none"
            : "bg-primary text-white hover:bg-primary/90 shadow-sm"
        }`}
      >
        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "Saved!" : "Update"}
      </button>
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-border/60 my-8" />;
}

export default function RequirementDoc() {
  const today = new Date().toISOString().split("T")[0];

  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docDate, setDocDate] = useState(today);
  const [preparedBy, setPreparedBy] = useState("");
  const [selectedClient, setSelectedClient] = useState("");
  const handleSelectClient = (name: string) => {
    setSelectedClient(name);
    if (name) setClientInfoOpen(true);
  };
  const [businessType, setBusinessType] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [keyProducts, setKeyProducts] = useState<string[]>([]);

  const handleBusinessTypeChange = (type: string) => {
    setBusinessType(type);
    // Clear selections that are no longer in the new option list
    const newOptions = getProductOptions(type);
    setKeyProducts((prev) => prev.filter((p) => newOptions.includes(p)));
  };

  const [businessGoals, setBusinessGoals] = useState("");
  const [keyChallenges, setKeyChallenges] = useState("");
  const [currentSystems, setCurrentSystems] = useState("");
  const [purpose, setPurpose] = useState("");
  const [keyFeatures, setKeyFeatures] = useState<string[]>([]);
  const [integrations, setIntegrations] = useState<string[]>([]);
  const [techStack, setTechStack] = useState<string[]>([]);
  const [hosting, setHosting] = useState("");
  const [security, setSecurity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [milestones, setMilestones] = useState<{
    id: string;
    title: string;
    date: string;
    payment: string;
    paymentStatus: string;
    taskStatus: string;
  }[]>([
    { id: "1", title: "", date: "", payment: "", paymentStatus: "", taskStatus: "" },
  ]);
  const [deliveryDate, setDeliveryDate] = useState("");

  const addMilestone = () =>
    setMilestones((prev) => [
      ...prev,
      { id: Date.now().toString(), title: "", date: "", payment: "", paymentStatus: "", taskStatus: "" },
    ]);

  const removeMilestone = (id: string) =>
    setMilestones((prev) => prev.filter((m) => m.id !== id));

  const updateMilestone = (
    id: string,
    field: "title" | "date" | "payment" | "paymentStatus" | "taskStatus",
    value: string
  ) => setMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)));

  const [budget, setBudget] = useState("");
  const [paymentStructure, setPaymentStructure] = useState("");
  const [additionalCosts, setAdditionalCosts] = useState("");
  const [postLaunch, setPostLaunch] = useState("");
  const [maintenance, setMaintenance] = useState("");
  const [versionHistory, setVersionHistory] = useState("");
  const [detailedNotes, setDetailedNotes] = useState("");

  const client = CLIENTS.find((c) => c.name === selectedClient);

  // ── Per-section save ──────────────────────────────────────────────────────
  const [savedSections, setSavedSections] = useState<Record<string, boolean>>({});

  const markSaved = useCallback((key: string) => {
    setSavedSections((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setSavedSections((prev) => ({ ...prev, [key]: false })), 2000);
  }, []);

  const persist = (key: string, data: object) => {
    const existing = JSON.parse(localStorage.getItem("req-doc") || "{}");
    localStorage.setItem("req-doc", JSON.stringify({ ...existing, [key]: data }));
  };

  const saveS1 = () => { persist("s1", { docTitle, docDate, preparedBy, selectedClient }); markSaved("s1"); };
  const saveS2 = () => { persist("s2", { businessType, targetAudience, keyProducts, businessGoals, keyChallenges, currentSystems }); markSaved("s2"); };
  const saveS3 = () => { persist("s3", { purpose, keyFeatures }); markSaved("s3"); };
  const saveS35 = () => { persist("s35", { detailedNotes }); markSaved("s35"); };
  const saveS4 = () => { persist("s4", { integrations, techStack, hosting, security }); markSaved("s4"); };
  const saveS5 = () => { persist("s5", { paymentStructure, additionalCosts }); markSaved("s5"); };
  const saveS6 = () => { persist("s6", { startDate, deliveryDate, milestones }); markSaved("s6"); };
  const saveS7 = () => { persist("s7", { postLaunch, maintenance }); markSaved("s7"); };

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("req-doc");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.s1) {
        if (d.s1.docTitle)       setDocTitle(d.s1.docTitle);
        if (d.s1.docDate)        setDocDate(d.s1.docDate);
        if (d.s1.preparedBy)     setPreparedBy(d.s1.preparedBy);
        if (d.s1.selectedClient) setSelectedClient(d.s1.selectedClient);
      }
      if (d.s2) {
        if (d.s2.businessType)    setBusinessType(d.s2.businessType);
        if (d.s2.targetAudience)  setTargetAudience(d.s2.targetAudience);
        if (d.s2.keyProducts)     setKeyProducts(d.s2.keyProducts);
        if (d.s2.businessGoals)   setBusinessGoals(d.s2.businessGoals);
        if (d.s2.keyChallenges)   setKeyChallenges(d.s2.keyChallenges);
        if (d.s2.currentSystems)  setCurrentSystems(d.s2.currentSystems);
      }
      if (d.s3) {
        if (d.s3.purpose)      setPurpose(d.s3.purpose);
        if (d.s3.keyFeatures)  setKeyFeatures(d.s3.keyFeatures);
      }
      if (d.s35) {
        if (d.s35.detailedNotes) setDetailedNotes(d.s35.detailedNotes);
      }
      if (d.s4) {
        if (d.s4.integrations) setIntegrations(d.s4.integrations);
        if (d.s4.techStack)    setTechStack(d.s4.techStack);
        if (d.s4.hosting)      setHosting(d.s4.hosting);
        if (d.s4.security)     setSecurity(d.s4.security);
      }
      if (d.s5) {
        if (d.s5.paymentStructure) setPaymentStructure(d.s5.paymentStructure);
        if (d.s5.additionalCosts)  setAdditionalCosts(d.s5.additionalCosts);
      }
      if (d.s6) {
        if (d.s6.startDate)    setStartDate(d.s6.startDate);
        if (d.s6.deliveryDate) setDeliveryDate(d.s6.deliveryDate);
        if (d.s6.milestones)   setMilestones(d.s6.milestones);
      }
      if (d.s7) {
        if (d.s7.postLaunch)   setPostLaunch(d.s7.postLaunch);
        if (d.s7.maintenance)  setMaintenance(d.s7.maintenance);
      }
    } catch { /* ignore parse errors */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const milestonesTotal = milestones.reduce((sum, m) => {
    const num = parseFloat(m.payment.replace(/[£$€,\s]/g, "")) || 0;
    return sum + num;
  }, 0);

  const formatCurrency = (n: number) =>
    n === 0 ? "—" : `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* Site Header */}
      <header className="bg-white border-b border-border sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <img src={onesoftLogo} alt="Onesoft" className="h-8 w-auto object-contain" />
          <div className="hidden sm:flex items-center gap-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              Hull, UK &middot; Islamabad, Pakistan
            </span>
            <a href="tel:+447984273482" className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Phone className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              +44 7984 273482
            </a>
            <a href="https://www.onesoft.org.uk" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
              <Globe className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              onesoft.org.uk
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-10">

        {/* Document Header */}
        <div className="mb-10 pb-8 border-b border-border">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Customer Requirement Collection</span>
          </div>
          <input
            type="text"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            placeholder="Untitled Document"
            className="w-full text-2xl sm:text-3xl font-bold text-foreground mb-2 bg-transparent border-0 border-b-2 border-transparent focus:border-primary/30 focus:outline-none placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:italic transition-colors pb-0.5"
          />
          <p className="text-sm text-muted-foreground">
            Fill in all required fields to generate a complete software requirements document for your client.
          </p>
        </div>

        {/* Section 1: Document Information */}
        <section>
          <SectionHeader icon={FileText} title="1. Document Information" subtitle="Basic details about this requirement document" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Document Title" required hint="e.g. Software Requirements for Acme Corp">
                <TextInput value={docTitle} onChange={setDocTitle} placeholder="Enter document title..." />
              </FormField>
            </div>
            <FormField label="Date" required>
              <DateInput value={docDate} onChange={setDocDate} />
            </FormField>
            <FormField label="Prepared By" required hint="Select the team member preparing this document">
              <SelectInput options={TEAM_MEMBERS} value={preparedBy} onChange={setPreparedBy} placeholder="Select team member" />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Client Name" required hint="Select from existing leads/customers or add new">
                <SelectInput
                  options={CLIENTS.map((c) => c.name)}
                  value={selectedClient}
                  onChange={handleSelectClient}
                  placeholder="Select or add client"
                />
              </FormField>
            </div>

            {/* Collapsible client details */}
            {selectedClient && (
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setClientInfoOpen((o) => !o)}
                  className="flex items-center gap-2 text-xs font-semibold text-primary uppercase tracking-wide hover:text-primary/80 transition-colors mb-3"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${clientInfoOpen ? "rotate-180" : ""}`}
                  />
                  {clientInfoOpen ? "Hide" : "Show"} Client Details
                </button>

                {clientInfoOpen && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                    <FormField label="Phone">
                      <ReadOnlyField value={client?.phone ?? ""} placeholder="—" />
                    </FormField>
                    <FormField label="Email">
                      <ReadOnlyField value={client?.email ?? ""} placeholder="—" />
                    </FormField>
                    <FormField label="Company Name">
                      <ReadOnlyField value={client?.company ?? ""} placeholder="—" />
                    </FormField>
                    <FormField label="Industry">
                      <ReadOnlyField value={client?.industry ?? ""} placeholder="—" />
                    </FormField>
                    <FormField label="Website">
                      <ReadOnlyField value={client?.website ?? ""} placeholder="—" />
                    </FormField>
                    <div className="sm:col-span-2">
                      <FormField label="Address">
                        <ReadOnlyField value={client?.address ?? ""} placeholder="—" />
                      </FormField>
                    </div>
                    <FormField label="City">
                      <ReadOnlyField value={client?.city ?? ""} placeholder="—" />
                    </FormField>
                    <FormField label="County / Region">
                      <ReadOnlyField value={client ? `${client.county}  ·  ${client.postcode}` : ""} placeholder="—" />
                    </FormField>
                  </div>
                )}
              </div>
            )}
          </div>
          <SaveButton sectionKey="s1" saved={!!savedSections.s1} onSave={saveS1} />
        </section>

        <SectionDivider />

        {/* Section 2: Business Information */}
        <section>
          <SectionHeader icon={Briefcase} title="2. Business Information" subtitle="Understanding the client's business context and goals" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Business Type" required hint="Selecting a type refines the Key Products / Services list below">
              <SelectInput options={BUSINESS_TYPES} value={businessType} onChange={handleBusinessTypeChange} placeholder="Select business type" />
            </FormField>
            <FormField label="Target Audience" required hint="Age group, profession, and geographical location">
              <TextInput value={targetAudience} onChange={setTargetAudience} placeholder="e.g. Professionals aged 25-45 in North America..." />
            </FormField>
            <div className="sm:col-span-2">
              <FormField
                label="Key Products / Services"
                required
                hint={
                  businessType
                    ? `Showing options relevant to "${businessType}" — search or select multiple`
                    : "Select a Business Type above to see relevant options, or search freely"
                }
              >
                <MultiSelectFeatures
                  selected={keyProducts}
                  onChange={setKeyProducts}
                  options={businessType ? getProductOptions(businessType) : COMBINED_OPTIONS}
                  placeholder={
                    businessType
                      ? `Search ${businessType} products / services...`
                      : "Select a business type first, or search all options..."
                  }
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Business Goals" required hint="Primary goals the client aims to achieve">
                <TextInput value={businessGoals} onChange={setBusinessGoals} rows={3} placeholder="e.g. Increase monthly active users by 30%, streamline operations..." />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Key Challenges" hint="Major problems or challenges the client currently faces">
                <TextInput value={keyChallenges} onChange={setKeyChallenges} rows={3} placeholder="e.g. Manual processes, customer acquisition, data silos..." />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Current Software or Systems Used" hint="CRM, ERP, inventory tools, or other existing platforms">
                <TextInput value={currentSystems} onChange={setCurrentSystems} placeholder="e.g. Salesforce CRM, QuickBooks, legacy inventory system..." />
              </FormField>
            </div>
          </div>
          <SaveButton sectionKey="s2" saved={!!savedSections.s2} onSave={saveS2} />
        </section>

        <SectionDivider />

        {/* Section 3: Software Requirements */}
        <section>
          <SectionHeader icon={Layers} title="3. Software Requirements" subtitle="Core functionality and feature specifications" />
          <div className="space-y-5">
            <FormField label="Purpose" required hint="The main problem this software will solve or functionality it will provide">
              <TextInput value={purpose} onChange={setPurpose} rows={3} placeholder="Describe the primary purpose of the software solution..." />
            </FormField>
            <FormField label="Key Features" required hint="Select all features required. You can search and add custom features.">
              <MultiSelectFeatures selected={keyFeatures} onChange={setKeyFeatures} />
            </FormField>

            {/* Summary Card */}
            {(purpose || keyFeatures.length > 0) && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">Client Requirements Summary</span>
                </div>
                {purpose && (
                  <div className="mb-3">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Purpose</span>
                    <p className="text-sm text-foreground mt-1">{purpose}</p>
                  </div>
                )}
                {keyFeatures.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Selected Features ({keyFeatures.length})</span>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {keyFeatures.map((f) => (
                        <span key={f} className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium">{f}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <SaveButton sectionKey="s3" saved={!!savedSections.s3} onSave={saveS3} />
        </section>

        <SectionDivider />

        {/* Section 3.5: Detailed Requirements Notes */}
        <section>
          <SectionHeader
            icon={PenLine}
            title="Detailed Requirements Notes"
            subtitle="Use this space to document any additional client requirements, discussions, or specifications in detail"
          />
          <RichTextEditor
            value={detailedNotes}
            onChange={setDetailedNotes}
            placeholder="Document detailed client requirements, meeting notes, feature specifications, user stories, or any additional context here. Supports rich formatting — headings, lists, bold, links, and more."
          />
          <SaveButton sectionKey="s35" saved={!!savedSections.s35} onSave={saveS35} />
        </section>

        <SectionDivider />

        {/* Section 4: Technical Requirements */}
        <section>
          <SectionHeader icon={Wrench} title="4. Technical Requirements" subtitle="Technology stack, integrations, and infrastructure" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Third-Party Integrations" hint="Search and select payment gateways, CRMs, marketing tools, shipping APIs, and more">
                <MultiSelectFeatures
                  selected={integrations}
                  onChange={setIntegrations}
                  options={INTEGRATIONS_OPTIONS}
                  placeholder="Search integrations — e.g. Stripe, Mailchimp, Salesforce..."
                />
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField label="Technology Stack" hint="Search and select frontend frameworks, backend, databases, cloud providers, and tools">
                <MultiSelectFeatures
                  selected={techStack}
                  onChange={setTechStack}
                  options={TECH_STACK_OPTIONS}
                  placeholder="Search tech — e.g. React, Node.js, PostgreSQL, AWS..."
                />
              </FormField>
            </div>
            <FormField label="Hosting Requirements" required>
              <SelectInput options={HOSTING_OPTIONS} value={hosting} onChange={setHosting} placeholder="Select hosting type" />
            </FormField>
            <FormField label="Security Requirements" hint="Data encryption, MFA, access controls, compliance needs">
              <TextInput value={security} onChange={setSecurity} placeholder="e.g. AES-256 encryption, MFA, GDPR compliance..." />
            </FormField>
          </div>
          <SaveButton sectionKey="s4" saved={!!savedSections.s4} onSave={saveS4} />
        </section>

        <SectionDivider />

        {/* Section 5: Budget & Costing */}
        <section>
          <SectionHeader icon={DollarSign} title="5. Budget & Costing" subtitle="Estimated costs and payment arrangements — linked to milestone payments" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Payment Structure" required>
              <SelectInput options={PAYMENT_STRUCTURES} value={paymentStructure} onChange={setPaymentStructure} placeholder="Select payment structure" />
            </FormField>
            <FormField label="Additional Costs" hint="Hosting fees, licences, third-party service costs, etc.">
              <TextInput value={additionalCosts} onChange={setAdditionalCosts} placeholder="e.g. £50/mo hosting, £200/yr software licence..." />
            </FormField>

            {/* Live budget summary linked to milestones */}
            <div className="sm:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wide text-primary">Budget Breakdown</span>
                <span className="ml-auto text-xs text-muted-foreground">Linked to milestone payments below</span>
              </div>

              {/* Milestone rows */}
              {milestones.some((m) => m.payment.trim() !== "") ? (
                <div className="space-y-1.5">
                  {milestones.filter((m) => m.payment.trim() !== "").map((m, i) => {
                    const amt = parseFloat(m.payment.replace(/[£$€,\s]/g, "")) || 0;
                    return (
                      <div key={m.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-flex w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold items-center justify-center flex-shrink-0">{i + 1}</span>
                          {m.title || `Milestone ${i + 1}`}
                        </span>
                        <span className="font-medium text-foreground tabular-nums">{formatCurrency(amt)}</span>
                      </div>
                    );
                  })}
                  <div className="border-t border-primary/20 pt-2 mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Total Milestone Budget</span>
                    <span className="text-base font-bold text-primary tabular-nums">{formatCurrency(milestonesTotal)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">No milestone payments entered yet. Add milestones with payment amounts in the Timeline section below — they will appear here automatically.</p>
              )}
            </div>
          </div>
          <SaveButton sectionKey="s5" saved={!!savedSections.s5} onSave={saveS5} />
        </section>

        <SectionDivider />

        {/* Section 6: Project Timeline */}
        <section>
          <SectionHeader icon={Clock} title="6. Project Timeline" subtitle="Milestones, start date, and expected delivery" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FormField label="Start Date" required>
              <DateInput value={startDate} onChange={setStartDate} />
            </FormField>
            <FormField label="Expected Delivery Date" required>
              <DateInput value={deliveryDate} onChange={setDeliveryDate} />
            </FormField>
            <div className="sm:col-span-2">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <FieldLabel label="Milestones" />
                  <button
                    type="button"
                    onClick={addMilestone}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-primary text-white hover:bg-primary/90 transition-colors"
                  >
                    <span className="text-base leading-none">+</span>
                    Add Milestone
                  </button>
                </div>

                <div className="space-y-2.5">
                  {milestones.map((m, index) => (
                    <div key={m.id} className="rounded-xl border border-border bg-background overflow-hidden">

                      {/* Row 1: Number + Title + Delete */}
                      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">{index + 1}</span>
                        </div>
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => updateMilestone(m.id, "title", e.target.value)}
                          placeholder={`e.g. Week ${index + 1}: Design & Planning`}
                          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => removeMilestone(m.id)}
                          disabled={milestones.length === 1}
                          title="Remove milestone"
                          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                          </svg>
                        </button>
                      </div>

                      {/* Row 2: Due Date + Payment + Payment Status + Task Status */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-3 pb-3">
                        {/* Due Date */}
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Due Date</p>
                          <input
                            type="date"
                            value={m.date}
                            onChange={(e) => updateMilestone(m.id, "date", e.target.value)}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          />
                        </div>

                        {/* Payment */}
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Payment</p>
                          <input
                            type="text"
                            value={m.payment}
                            onChange={(e) => updateMilestone(m.id, "payment", e.target.value)}
                            placeholder="e.g. £500"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          />
                        </div>

                        {/* Payment Status */}
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Payment Status</p>
                          <div className="relative">
                            <select
                              value={m.paymentStatus}
                              onChange={(e) => updateMilestone(m.id, "paymentStatus", e.target.value)}
                              className="w-full appearance-none px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-7"
                              style={{ color: m.paymentStatus === "Paid" ? "#16a34a" : m.paymentStatus === "Overdue" ? "#dc2626" : m.paymentStatus === "Partial" ? "#d97706" : undefined }}
                            >
                              <option value="">— Select —</option>
                              <option value="Pending">Pending</option>
                              <option value="Partial">Partial</option>
                              <option value="Paid">Paid</option>
                              <option value="Overdue">Overdue</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>

                        {/* Task Status */}
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1 ml-0.5">Task Status</p>
                          <div className="relative">
                            <select
                              value={m.taskStatus}
                              onChange={(e) => updateMilestone(m.id, "taskStatus", e.target.value)}
                              className="w-full appearance-none px-3 py-2 rounded-lg border border-border bg-muted/40 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-7"
                              style={{ color: m.taskStatus === "Completed" ? "#16a34a" : m.taskStatus === "Cancelled" ? "#dc2626" : m.taskStatus === "In Progress" ? "#2563eb" : m.taskStatus === "On Hold" ? "#d97706" : undefined }}
                            >
                              <option value="">— Select —</option>
                              <option value="Not Started">Not Started</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Completed">Completed</option>
                              <option value="On Hold">On Hold</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>
                      </div>

                    </div>
                  ))}
                </div>

                {/* Running total */}
                {milestonesTotal > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-4 py-2.5">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total across {milestones.filter((m) => m.payment.trim() !== "").length} milestone{milestones.filter((m) => m.payment.trim() !== "").length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-sm font-bold text-primary tabular-nums">{formatCurrency(milestonesTotal)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">Key phases and their expected completion dates — payments auto-update the Budget section above</p>
              </div>
            </div>
          </div>
          <SaveButton sectionKey="s6" saved={!!savedSections.s6} onSave={saveS6} />
        </section>

        <SectionDivider />

        {/* Section 7: Support & Maintenance */}
        <section>
          <SectionHeader icon={Target} title="7. Support & Maintenance" subtitle="Post-launch support and ongoing maintenance plans" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="sm:col-span-2">
              <FormField label="Post-Launch Support" hint="Bug fixes, updates, improvements after go-live">
                <TextInput
                  value={postLaunch}
                  onChange={setPostLaunch}
                  rows={3}
                  placeholder="e.g. 30-day bug fix warranty, monthly feature updates, dedicated support channel..."
                />
              </FormField>
            </div>
            <FormField label="Maintenance Duration" required>
              <SelectInput options={MAINTENANCE_OPTIONS} value={maintenance} onChange={setMaintenance} placeholder="Select duration" />
            </FormField>
          </div>
          <SaveButton sectionKey="s7" saved={!!savedSections.s7} onSave={saveS7} />
        </section>

        <SectionDivider />

        {/* Footer */}
        <section>
          <div className="rounded-xl bg-muted/50 border border-border p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-6 h-6 rounded bg-muted-foreground/10 flex items-center justify-center">
                <FileText className="w-3 h-3 text-muted-foreground" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Document Footer</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="sm:col-span-2">
                <FormField label="Version History" hint="e.g. Version 1.0 – Apr 04, 2026 – Initial Draft">
                  <TextInput value={versionHistory} onChange={setVersionHistory} placeholder="Version 1.0 – [Date] – Initial Draft" />
                </FormField>
              </div>
              <FormField label="Prepared By (Auto)" hint="Populated from document header">
                <ReadOnlyField value={preparedBy} placeholder="Set in document header" />
              </FormField>
              <FormField label="Document Date" hint="Auto-populated from header">
                <ReadOnlyField value={docDate} />
              </FormField>
            </div>
          </div>
        </section>

        {/* Bottom padding */}
        <div className="h-10" />
      </div>

      {/* Stats + CTA */}
      <section className="border-t border-border bg-primary py-14 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-12">
            {[
              { value: "50+",   label: "Projects Delivered",  sub: "End-to-end solutions"       },
              { value: "30+",   label: "Happy Clients",        sub: "UK & international"          },
              { value: "5+",    label: "Years Experience",     sub: "Since 2019"                  },
              { value: "98%",   label: "Client Satisfaction",  sub: "Rated excellent or good"     },
            ].map(({ value, label, sub }) => (
              <div key={label} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold text-white leading-none mb-1">{value}</p>
                <p className="text-sm font-semibold text-white/90 mb-0.5">{label}</p>
                <p className="text-[11px] text-white/60">{sub}</p>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="border-t border-white/15 mb-12" />

          {/* CTA */}
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-3">Start Your Project</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
              Ready to bring your idea to life?
            </h2>
            <p className="text-sm text-white/70 max-w-lg mx-auto mb-8">
              Fill in this requirement form and our team will review your needs and get back to you within one business day.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="mailto:info@onesoft.org.uk"
                className="inline-flex items-center gap-2 bg-white text-primary font-semibold text-sm px-6 py-3 rounded-xl hover:bg-white/90 transition-colors shadow-sm"
              >
                <Mail className="w-4 h-4" />
                info@onesoft.org.uk
              </a>
              <a
                href="tel:+447984273482"
                className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold text-sm px-6 py-3 rounded-xl hover:bg-white/20 transition-colors border border-white/20"
              >
                <Phone className="w-4 h-4" />
                +44 7984 273482
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Businesses We've Worked With */}
      <section className="bg-muted/30 border-t border-border py-12 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {/* Heading */}
          <div className="text-center mb-8">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary mb-2">Trusted By</p>
            <h2 className="text-xl font-bold text-foreground">Businesses We've Worked With</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
              Proud to have partnered with organisations across a wide range of industries throughout the UK and beyond.
            </p>
          </div>

          {/* Industry grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {([
              { icon: Monitor,        label: "Software & Technology",    desc: "Custom apps & digital platforms" },
              { icon: Heart,          label: "Healthcare & Wellness",    desc: "Clinics, NHS & health tech" },
              { icon: DollarSign,     label: "Financial Services",       desc: "Banking, insurance & wealth" },
              { icon: CreditCard,     label: "Fintech & Payments",       desc: "Payment systems & open banking" },
              { icon: GraduationCap,  label: "Education & E-learning",   desc: "Schools, colleges & LMS" },
              { icon: ShoppingCart,   label: "E-commerce & Retail",      desc: "Online shops & POS systems" },
              { icon: Truck,          label: "Logistics & Transport",    desc: "Fleet, delivery & routing" },
              { icon: Scale,          label: "Legal & Compliance",       desc: "Solicitors & regulatory tech" },
              { icon: Home,           label: "Property & Real Estate",   desc: "Agencies, lettings & PropTech" },
              { icon: Cloud,          label: "Cloud & IT Services",      desc: "Infrastructure & DevOps" },
              { icon: UtensilsCrossed,label: "Food & Hospitality",       desc: "Restaurants, hotels & catering" },
              { icon: Hammer,         label: "Construction & Engineering",desc: "Builders, contractors & civil" },
              { icon: Palette,        label: "Media & Creative",         desc: "Agencies, studios & content" },
              { icon: BookOpen,       label: "Corporate Training",       desc: "L&D, CPD & workforce upskilling" },
              { icon: Zap,            label: "Energy & Utilities",       desc: "Renewables & smart energy" },
              { icon: Shield,         label: "Security & Surveillance",  desc: "Physical & cyber security" },
              { icon: Factory,        label: "Manufacturing",            desc: "Production, ERP & IoT" },
              { icon: Brain,          label: "Data & AI",                desc: "Analytics, ML & business intel" },
              { icon: Handshake,      label: "Non-profit & Charity",     desc: "Charities, NGOs & social impact" },
              { icon: Car,            label: "Automotive & Fleet",       desc: "Dealerships & fleet management" },
            ] as { icon: React.ElementType; label: string; desc: string }[]).map(({ icon: Icon, label, desc }) => (
              <div
                key={label}
                className="group flex flex-col gap-2 rounded-xl border border-border bg-white px-4 py-4 hover:border-primary/40 hover:shadow-sm transition-all duration-200"
              >
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                  <Icon className="w-4.5 h-4.5 text-primary" size={18} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-snug">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA note */}
          <p className="text-center text-xs text-muted-foreground mt-8">
            Ready to join them?{" "}
            <a href="https://www.onesoft.org.uk" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">
              Get in touch with Onesoft →
            </a>
          </p>
        </div>
      </section>

      {/* Site Footer */}
      <footer className="border-t border-border bg-white mt-auto">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-6">
            {/* Logo & tagline */}
            <div className="flex flex-col items-center sm:items-start gap-2">
              <img src={onesoftLogo} alt="Onesoft" className="h-7 w-auto object-contain" />
              <p className="text-xs text-muted-foreground">Crafting smart software solutions.</p>
            </div>

            {/* Contact details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-xs text-muted-foreground">
              <a href="tel:+447984273482" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Phone className="w-3 h-3 text-primary flex-shrink-0" />
                +44 7984 273482 (UK)
              </a>
              <a href="tel:+923334199233" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                <Phone className="w-3 h-3 text-primary flex-shrink-0" />
                +92 333 4199233 (PK)
              </a>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                Hull, United Kingdom
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-primary flex-shrink-0" />
                Islamabad, Pakistan
              </span>
              <a
                href="https://www.onesoft.org.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:text-primary transition-colors sm:col-span-2"
              >
                <Globe className="w-3 h-3 text-primary flex-shrink-0" />
                www.onesoft.org.uk
              </a>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/60">
            <span>© {new Date().getFullYear()} Onesoft. All rights reserved.</span>
            <span>Customer Requirement Collection Document</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
