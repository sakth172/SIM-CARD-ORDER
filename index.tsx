import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Schema } from "@google/genai";

// --- Configuration ---
const WHATSAPP_NUMBER = "919360626529";
const DELIVERY_CHARGE = 50;

// Updated UPI details from user request
const MERCHANT_UPI = "sakthi000505@okhdfcbank"; 
const MERCHANT_NAME = "SAKTHI";

// Define plan structure
type Plans = {
    [key in 'NEW' | 'MNP' | 'REPLACEMENT']: {
        [key in 'AIRTEL' | 'JIO' | 'VI']?: string[];
    };
};

const PLANS: Plans = {
    "NEW": {
        "AIRTEL": ["249", "349"],
        "JIO": ["349"],
        "VI": ["199", "299"]
    },
    "MNP": {
        "AIRTEL": ["199", "349"],
        "JIO": ["349"],
        "VI": ["199", "299"]
    },
    "REPLACEMENT": {
        "AIRTEL": ["200"],
        "VI": ["200"]
    }
};

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const extractionSchema: Schema = {
    type: Type.OBJECT,
    properties: {
        customerName: { type: Type.STRING, description: "Customer's full name" },
        mobileNumber: { type: Type.STRING, description: "Customer's mobile number" },
        requestType: { type: Type.STRING, enum: ["NEW", "MNP", "REPLACEMENT"], description: "Type of SIM request" },
        network: { type: Type.STRING, enum: ["AIRTEL", "JIO", "VI"], description: "Telecom operator" },
        planAmount: { type: Type.STRING, description: "The plan price amount if mentioned (e.g. 349)" },
        address: { type: Type.STRING, description: "Full address extracted from text" },
        paymentMethod: { type: Type.STRING, enum: ["UPI", "Card", "Cash on Delivery"], description: "Preferred payment method" },
        transactionId: { type: Type.STRING, description: "Transaction ID if mentioned" }
    },
    required: ["customerName", "mobileNumber", "requestType", "network"],
};

// --- Components ---

function App() {
    // Form State
    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        type: 'NEW' as keyof Plans,
        network: 'AIRTEL' as 'AIRTEL' | 'JIO' | 'VI',
        plan: '',
        address: '',
        locationLink: '',
        paymentMethod: 'Cash on Delivery',
        transactionId: ''
    });

    // UI State
    const [rawInput, setRawInput] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [locationStatus, setLocationStatus] = useState<string>('');

    // Update plan selection when type/network changes to ensure valid plan
    useEffect(() => {
        const availablePlans = getAvailablePlans();
        if (availablePlans.length > 0 && !availablePlans.includes(formData.plan)) {
            setFormData(prev => ({ ...prev, plan: availablePlans[0] }));
        } else if (availablePlans.length === 0) {
            setFormData(prev => ({ ...prev, plan: '' }));
        }
    }, [formData.type, formData.network]);

    const getAvailablePlans = () => {
        return PLANS[formData.type]?.[formData.network] || [];
    };

    // Calculate Total Price
    const getTotalPrice = () => {
        const planPrice = parseInt(formData.plan) || 0;
        return planPrice + DELIVERY_CHARGE;
    };

    // Generate QR Code URL
    const getQrCodeUrl = () => {
        const amount = getTotalPrice();
        if (amount <= 0) return '';
        
        // UPI Link Format: upi://pay?pa=ADDRESS&pn=NAME&am=AMOUNT&cu=INR
        const upiLink = `upi://pay?pa=${MERCHANT_UPI}&pn=${encodeURIComponent(MERCHANT_NAME)}&am=${amount}&cu=INR`;
        // Use a public QR code API (QR Server)
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
    };

    // AI Auto-Fill Handler
    const handleAiAutoFill = async () => {
        if (!rawInput.trim()) return;

        setIsAiLoading(true);
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Extract SIM order details from this text: "${rawInput}".`,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: extractionSchema
                }
            });

            const text = response.text;
            if (text) {
                const extracted = JSON.parse(text);
                
                setFormData(prev => ({
                    ...prev,
                    name: extracted.customerName || prev.name,
                    mobile: extracted.mobileNumber || prev.mobile,
                    type: extracted.requestType || prev.type,
                    network: extracted.network || prev.network,
                    plan: extracted.planAmount || prev.plan,
                    address: extracted.address || prev.address,
                    paymentMethod: extracted.paymentMethod || prev.paymentMethod,
                    transactionId: extracted.transactionId || prev.transactionId
                }));
            }
        } catch (e) {
            console.error("AI Error:", e);
            alert("Could not auto-fill details. Please try again or fill manually.");
        } finally {
            setIsAiLoading(false);
        }
    };

    // Location Handler
    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return;
        }

        setLocationStatus('Fetching location...');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const link = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
                setFormData(prev => ({ ...prev, locationLink: link }));
                setLocationStatus('Location added!');
                setTimeout(() => setLocationStatus(''), 3000);
            },
            (error) => {
                setLocationStatus('');
                alert("Unable to retrieve your location. Please allow location access.");
            }
        );
    };

    // WhatsApp Send Handler
    const handleSend = () => {
        if (!formData.name || !formData.mobile || !formData.address || !formData.plan) {
            alert("Please fill all required fields (*)");
            return;
        }

        const total = getTotalPrice();

        let msg = `📩 *SIM ORDER*\n\n`;
        msg += `🧑 *Name:* ${formData.name}\n`;
        msg += `📞 *Mobile:* ${formData.mobile}\n\n`;
        msg += `📌 *Type:* ${formData.type}\n`;
        msg += `📶 *Network:* ${formData.network}\n`;
        msg += `💰 *Plan:* ₹${formData.plan}\n`;
        msg += `🚚 *Delivery:* ₹${DELIVERY_CHARGE}\n`;
        msg += `💵 *Total:* ₹${total}\n`;
        msg += `💳 *Payment:* ${formData.paymentMethod}\n`;
        
        if (formData.paymentMethod === 'UPI' && formData.transactionId) {
            msg += `🆔 *Txn ID:* ${formData.transactionId}\n`;
        }

        msg += `\n🏠 *Address:* ${formData.address}\n`;

        if (formData.locationLink) {
            msg += `\n📍 *Location:* ${formData.locationLink}\n`;
        }

        const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
        window.open(url, "_blank");
    };

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={{margin: 0}}>SIM Order Form</h2>
                <p style={{margin: '5px 0 0', opacity: 0.8, fontSize: '0.9rem'}}>Powered by Gemini AI</p>
            </div>

            {/* AI Section */}
            <div style={styles.section}>
                <label style={styles.label}>✨ AI Auto-Fill (Optional)</label>
                <textarea
                    style={{...styles.input, minHeight: '60px', fontSize: '13px'}}
                    placeholder="Paste customer request here (e.g. 'John needs Jio New Sim 349 plan via UPI')..."
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                />
                <button 
                    onClick={handleAiAutoFill}
                    disabled={isAiLoading || !rawInput}
                    style={{...styles.aiButton, opacity: (isAiLoading || !rawInput) ? 0.6 : 1}}
                >
                    {isAiLoading ? "Analyzing..." : "Auto-Fill Form"}
                </button>
            </div>

            {/* Main Form */}
            <div style={styles.formGrid}>
                <div>
                    <label style={styles.label}>Customer Name *</label>
                    <input 
                        style={styles.input} 
                        value={formData.name} 
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="Full Name"
                    />
                </div>
                <div>
                    <label style={styles.label}>Mobile Number *</label>
                    <input 
                        style={styles.input} 
                        value={formData.mobile} 
                        onChange={(e) => handleChange('mobile', e.target.value)}
                        placeholder="10-digit number"
                        type="tel"
                    />
                </div>
            </div>

            <div style={styles.formGrid}>
                <div>
                    <label style={styles.label}>Request Type *</label>
                    <select 
                        style={styles.select}
                        value={formData.type}
                        onChange={(e) => handleChange('type', e.target.value)}
                    >
                        <option value="NEW">NEW</option>
                        <option value="MNP">MNP</option>
                        <option value="REPLACEMENT">REPLACEMENT</option>
                    </select>
                </div>
                <div>
                    <label style={styles.label}>Network *</label>
                    <select 
                        style={styles.select}
                        value={formData.network}
                        onChange={(e) => handleChange('network', e.target.value)}
                    >
                        <option value="AIRTEL">AIRTEL</option>
                        <option value="JIO">JIO</option>
                        <option value="VI">VI</option>
                    </select>
                </div>
            </div>

            <div style={{marginBottom: '15px'}}>
                <label style={styles.label}>Select Plan *</label>
                <select 
                    style={styles.select}
                    value={formData.plan}
                    onChange={(e) => handleChange('plan', e.target.value)}
                >
                    {getAvailablePlans().length === 0 ? (
                        <option value="">No plans available</option>
                    ) : (
                        getAvailablePlans().map(price => (
                            <option key={price} value={price}>₹{price}</option>
                        ))
                    )}
                </select>
            </div>

            <div style={{marginBottom: '15px'}}>
                <label style={styles.label}>Address *</label>
                <textarea 
                    style={{...styles.input, minHeight: '80px'}}
                    value={formData.address}
                    onChange={(e) => handleChange('address', e.target.value)}
                    placeholder="Door No, Street, Area, City"
                />
            </div>

            {/* Location Section */}
            <div style={{marginBottom: '20px'}}>
                <label style={styles.label}>Location Link</label>
                <div style={{display: 'flex', gap: '8px'}}>
                    <input 
                        style={{...styles.input, marginBottom: 0}}
                        value={formData.locationLink}
                        onChange={(e) => handleChange('locationLink', e.target.value)}
                        placeholder="https://maps.google.com..."
                    />
                    <button 
                        onClick={handleGetLocation}
                        style={styles.locationButton}
                        title="Use Current Location"
                    >
                        📍
                    </button>
                </div>
                {locationStatus && <div style={styles.hint}>{locationStatus}</div>}
            </div>

            {/* Payment Section */}
            <div style={styles.section}>
                <label style={styles.label}>Payment Method *</label>
                <select 
                    style={{...styles.select, marginBottom: '10px'}}
                    value={formData.paymentMethod}
                    onChange={(e) => handleChange('paymentMethod', e.target.value)}
                >
                    <option value="Cash on Delivery">Cash on Delivery</option>
                    <option value="UPI">UPI (Google Pay / PhonePe / Paytm)</option>
                    <option value="Card">Card</option>
                </select>

                <div style={styles.summaryRow}>
                    <span>Plan: ₹{formData.plan || 0}</span>
                    <span>+ Delivery: ₹{DELIVERY_CHARGE}</span>
                    <span style={{fontWeight: 'bold', color: '#2563eb'}}>Total: ₹{getTotalPrice()}</span>
                </div>

                {formData.paymentMethod === 'UPI' && (
                    <div style={styles.upiContainer}>
                        <div style={{textAlign: 'center', marginBottom: '10px'}}>
                            <img 
                                src={getQrCodeUrl()} 
                                alt="UPI QR Code" 
                                style={{width: '180px', height: '180px', borderRadius: '8px', border: '1px solid #ddd'}}
                            />
                            <div style={{fontSize: '12px', color: '#555', marginTop: '5px'}}>
                                Paying <b>₹{getTotalPrice()}</b> to <b>{MERCHANT_NAME}</b>
                            </div>
                        </div>
                        <label style={styles.label}>Transaction ID / UTR (Required for UPI) *</label>
                        <input 
                            style={styles.input}
                            value={formData.transactionId}
                            onChange={(e) => handleChange('transactionId', e.target.value)}
                            placeholder="Enter 12-digit UTR or Reference ID"
                        />
                    </div>
                )}
            </div>

            <button onClick={handleSend} style={styles.sendButton}>
                Send Order via WhatsApp
            </button>
        </div>
    );
}

const styles = {
    container: {
        width: '100%',
        maxWidth: '450px',
        backgroundColor: '#fff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column' as const,
    },
    header: {
        textAlign: 'center' as const,
        marginBottom: '24px',
        color: '#111827',
    },
    section: {
        backgroundColor: '#f9fafb',
        padding: '16px',
        borderRadius: '12px',
        marginBottom: '20px',
        border: '1px solid #e5e7eb',
    },
    formGrid: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '15px',
    },
    label: {
        display: 'block',
        fontSize: '13px',
        fontWeight: 600,
        color: '#374151',
        marginBottom: '6px',
    },
    input: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #d1d5db',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
        marginBottom: '6px',
    },
    select: {
        width: '100%',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid #d1d5db',
        fontSize: '14px',
        backgroundColor: '#fff',
        outline: 'none',
    },
    aiButton: {
        width: '100%',
        padding: '10px',
        backgroundColor: '#6366f1',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontWeight: 600,
        cursor: 'pointer',
        fontSize: '13px',
        marginTop: '8px',
    },
    locationButton: {
        padding: '0 16px',
        backgroundColor: '#3b82f6',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '18px',
    },
    sendButton: {
        width: '100%',
        padding: '14px',
        backgroundColor: '#25D366',
        color: 'white',
        border: 'none',
        borderRadius: '12px',
        fontWeight: 700,
        fontSize: '16px',
        cursor: 'pointer',
        boxShadow: '0 4px 6px rgba(37, 211, 102, 0.2)',
        marginTop: '8px',
    },
    hint: {
        fontSize: '12px',
        color: '#059669',
        marginTop: '4px',
    },
    summaryRow: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '13px',
        color: '#4b5563',
        marginBottom: '10px',
        borderTop: '1px solid #e5e7eb',
        paddingTop: '10px',
    },
    upiContainer: {
        marginTop: '15px',
        padding: '15px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
    }
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);