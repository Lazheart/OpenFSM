// Los mismos 3 tenants que siembra ingest/generator.py

export interface TenantInfo {
  id: string
  name: string
  short: string
  industry: string
  tagline: string
  color: string
  specialties: string[]
  problems: string[]
  parts: [sku: string, name: string, category: string, cost: number, price: number][]
}

export const TENANTS: TenantInfo[] = [
  {
    id: 'tenant-alpha',
    name: 'Apex HVAC Solutions',
    short: 'Apex HVAC',
    industry: 'HVAC',
    tagline: 'Climatización y refrigeración industrial',
    color: '#0e8ab0',
    specialties: ['HVAC Maintenance', 'Chiller Repair', 'Air Conditioning', 'Duct Cleaning', 'Heat Pumps'],
    problems: [
      'AC unit blowing lukewarm air in server room',
      'Chiller compressor loud grinding noise and vibration',
      'Thermostat unresponsive and displaying error code E-42',
      'Severe water leakage around indoor air handling unit',
      'Scheduled biannual preventative HVAC maintenance',
      'Rooftop condenser coil freezing up under load',
      'Emergency ventilation failure in production cleanroom',
    ],
    parts: [
      ['COMP-501', 'Rotary Compressor 5HP', 'Compressors', 450, 750],
      ['FILT-102', 'HEPA Industrial Air Filter', 'Filters', 15, 35],
      ['THERM-204', 'Digital Smart Thermostat', 'Controls', 65, 140],
      ['FAN-303', 'Condenser Fan Motor 1/2HP', 'Motors', 120, 220],
      ['VALV-401', 'Thermostatic Expansion Valve', 'Valves', 45, 95],
      ['REFR-134', 'R-410A Refrigerant Cylinder 25lb', 'Chemicals', 180, 310],
      ['CAP-105', 'Dual Run Capacitor 45/5 MFD', 'Electrical', 12, 30],
      ['CONT-201', 'Single Pole Defrost Contactor', 'Electrical', 18, 42],
    ],
  },
  {
    id: 'tenant-beta',
    name: 'BlueSky Telecom Services',
    short: 'BlueSky Telecom',
    industry: 'Telecommunications',
    tagline: 'Fibra óptica, torres y enlaces de red',
    color: '#7048e8',
    specialties: ['Fiber Optic Splicing', '5G Tower Alignment', 'Microwave Links', 'Network Routers', 'Data Cabling'],
    problems: [
      'Fiber trunk cut along highway construction sector',
      'High packet loss and latency on base transceiver station',
      'Optical signal attenuation exceeding -28dBm threshold',
      'Cell tower RF power amplifier alert',
      'Scheduled firmware upgrade and link optimization',
      'Emergency backup battery failure at microwave repeater',
      'Customer premises enterprise WAN circuit degradation',
    ],
    parts: [
      ['FIBR-001', 'Single Mode Fiber Patch Cord 10m', 'Cabling', 12, 28],
      ['SFP-10G', '10GBASE-LR SFP+ Transceiver', 'Optics', 85, 180],
      ['ROUT-C9', 'Enterprise Core Switch 48-Port', 'Hardware', 1200, 2200],
      ['SPLICE-T', 'Fusion Splice Protection Sleeves', 'Consumables', 14, 32],
      ['ANT-5G', 'MIMO Sector Antenna 3.5GHz', 'RF Equipment', 350, 680],
      ['UPS-3000', 'Rackmount Battery Backup 3000VA', 'Power', 480, 890],
      ['OTDR-AD', 'Optical Connector Adapter SC/APC', 'Optics', 8, 20],
      ['CAB-CAT6', 'Cat6A Shielded Bulk Cable 1000ft', 'Cabling', 140, 260],
    ],
  },
  {
    id: 'tenant-gamma',
    name: 'GreenField Electrical & Power',
    short: 'GreenField Power',
    industry: 'Electrical',
    tagline: 'Subestaciones y distribución eléctrica',
    color: '#12a150',
    specialties: ['Substation Maintenance', 'Transformer Repair', 'Switchgear', 'Solar Inverters', 'Power Quality'],
    problems: [
      'Medium voltage breaker trip on thermal overload',
      'Transformer oil temperature alarm at substation',
      'Solar inverter string fault and ground leakage',
      'Switchgear partial discharge detected on survey',
      'Scheduled infrared thermography inspection',
      'Harmonic distortion complaints from industrial client',
      'Emergency generator failed weekly load test',
    ],
    parts: [
      ['BRKR-630', 'Molded Case Breaker 630A', 'Protection', 520, 910],
      ['FUSE-HV', 'HV Current Limiting Fuse 24kV', 'Protection', 95, 190],
      ['RELAY-P3', 'Digital Protection Relay', 'Controls', 780, 1350],
      ['OIL-TR', 'Transformer Insulating Oil 200L', 'Chemicals', 260, 420],
      ['INV-50K', 'Inverter Control Board 50kW', 'Electronics', 640, 1100],
      ['CT-400', 'Current Transformer 400/5A', 'Metering', 70, 150],
      ['LUG-240', 'Compression Lug 240mm2 (10pk)', 'Consumables', 22, 48],
      ['SURGE-T2', 'Type 2 Surge Protective Device', 'Protection', 110, 210],
    ],
  },
]

export function tenantById(id: string | undefined): TenantInfo {
  return TENANTS.find((t) => t.id === id) ?? TENANTS[0]
}
