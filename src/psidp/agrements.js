/**
 * Procédés de précontrainte par post-tension (torons T15 / 0,6") : données des agréments (évaluations techniques
 * européennes ETA) et des documentations des fabricants utiles au calcul PSI-DP — section d'acier, gaine, plaque
 * d'ancrage, entraxe et distance au bord minimaux (fonction de la résistance du béton à la mise en tension f_cm,0),
 * rentrée de clavettes, frottement. Chaque valeur provient du document cité (page dans `ref`) ; null = non trouvé, la
 * valeur générique est alors utilisée et signalée.
 * Frottement : BPEL 3.3,11 σ(x) = σ_p0 e^(−fα − φx) ; ETA / EN 1992 : P(x) = P0 e^(−μ(θ + kx)) ⇒ f = μ, φ = μ k.
 * Générique : BPEL 91 révisé 99, annexe 3 (torons en conduits acier, cas I : f = 0,18 (R ≥ 6 m), φ = 0,002 m⁻¹ ;
 * cas II, nombreux joints ou reprises : f = 0,20, φ = 0,003 m⁻¹), recul d'ancrage 6 mm, plaques forfaitaires.
 * Distance au bord, règle commune Freyssinet (brochure V14 p. 11) et VSL (ETA 06/0006 § 3.5.2) :
 * e ≥ x/2 + c − 10 mm (x : entraxe minimal, c : enrobage sur l'ouvrage) ; DYWIDAG : distance de la brochure (enrobage
 * 30 mm) corrigée de l'enrobage.
 */
export const AGREMENTS = {
  generique: {
    label: 'Générique (BPEL annexe 3, plaques forfaitaires)', document: 'BPEL 91 révisé 99, annexe 3', url: null,
    rentree_mm: 6, // frottement : cas I ou II de l'annexe 3 selon l'option bp_cas
    unites: {
      '7': { nom: '7 T 15 S', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 65, gaine_int_mm: 60, plaque_mm: [200, 200], entraxe_par_fcm0_mm: null, Rmin_m: 4.5 },
      '12': { nom: '12 T 15 S', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 80, gaine_int_mm: 75, plaque_mm: [250, 250], entraxe_par_fcm0_mm: null, Rmin_m: 6 },
      '19': { nom: '19 T 15 S', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 95, gaine_int_mm: 90, plaque_mm: [300, 300], entraxe_par_fcm0_mm: null, Rmin_m: 7 },
      '12T13': { nom: '12 T 13 (PSIDP-EL 84)', torons: 12, Ap_mm2: 1116, gaine_ext_mm: 70, gaine_int_mm: 65, plaque_mm: [220, 220], entraxe_par_fcm0_mm: null, Rmin_m: 6 },
    },
  },
  freyssinet: {
    label: 'Freyssinet C (ETA 06/0226)',
    document: 'Brochure Freyssinet « La précontrainte Freyssinet » V14 (09/2014), conforme à l\'ETA 06/0226 (texte de l\'ETA non lu)',
    url: 'https://www.freysas.com.tr/wp-content/uploads/sites/45/2021/12/C-III-1_FREYSSINET-PRESTRESSING_EN_V14.pdf',
    rentree_mm: null, mu: 0.19, k_rad_m: 0.007, bordRegle: true,
    note: 'μ = 0,19 : torons non lubrifiés en gaine feuillard (0,17 si lubrifiés), k = 0,007 rad/m (p. 29) ; recul d\'ancrage non donné par la brochure : 6 mm par défaut ; entraxe a pour f_cm,0 = 24, 44 ou 60 MPa (cylindre, à la mise en tension, p. 11).',
    unites: {
      '4C15': { nom: '4C15 (Freyssinet)', torons: 4, Ap_mm2: 600, gaine_ext_mm: 50, gaine_int_mm: 45, plaque_mm: [150, 120], entraxe_par_fcm0_mm: {"24": 250, "44": 220, "60": 200}, Rmin_m: 4.5, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '7C15': { nom: '7C15 (Freyssinet)', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 65, gaine_int_mm: 60, plaque_mm: [180, 150], entraxe_par_fcm0_mm: {"24": 330, "44": 260, "60": 240}, Rmin_m: 6.0, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '9C15': { nom: '9C15 (Freyssinet)', torons: 9, Ap_mm2: 1350, gaine_ext_mm: 70, gaine_int_mm: 65, plaque_mm: [225, 185], entraxe_par_fcm0_mm: {"24": 380, "44": 300, "60": 280}, Rmin_m: 6.5, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '12C15': { nom: '12C15 (Freyssinet)', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 85, gaine_int_mm: 80, plaque_mm: [240, 200], entraxe_par_fcm0_mm: {"24": 430, "44": 320, "60": 300}, Rmin_m: 8.0, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '13C15': { nom: '13C15 (Freyssinet)', torons: 13, Ap_mm2: 1950, gaine_ext_mm: 85, gaine_int_mm: 80, plaque_mm: [250, 210], entraxe_par_fcm0_mm: {"24": 450, "44": 340, "60": 310}, Rmin_m: 8.0, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
      '19C15': { nom: '19C15 (Freyssinet)', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 100, gaine_int_mm: 95, plaque_mm: [300, 250], entraxe_par_fcm0_mm: {"24": 530, "44": 400, "60": 380}, Rmin_m: 9.5, ref: 'brochure V14 : plaque A×B p. 8, entraxe a p. 11, gaine p. 9, R_min = 100 Ø_int (règle p. 28)' },
    },
  },
  vsl: {
    label: 'VSL (ETA 06/0006)',
    document: 'ETA 06/0006 version 5 du 12/05/2026 (Cerema) ; gaines : brochure VSL Post-Tensioning Solutions (2009)',
    url: 'https://www.heijmans.nl/media/documents/2582/ETA_06-0006_v5_TSp6YRK.pdf',
    rentree_mm: 6, mu: 0.18, k_rad_m: 0.005, bordRegle: true,
    note: 'Recul 6 mm (A.2.6.3), μ = 0,18 et k = 0,005 rad/m en gaine feuillard (A.2.6.1, p. 26-28). Plaques, entraxes et distances au bord de l\'annexe A.6 non lus : plaques forfaitaires génériques.',
    unites: {
      '6-4': { nom: 'VSL 6-4', torons: 4, Ap_mm2: 600, gaine_ext_mm: 50, gaine_int_mm: 45, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 4.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-7': { nom: 'VSL 6-7', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 62, gaine_int_mm: 55, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 5.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-9': { nom: 'VSL 6-9', torons: 9, Ap_mm2: 1350, gaine_ext_mm: 72, gaine_int_mm: 65, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 6.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-12': { nom: 'VSL 6-12', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 82, gaine_int_mm: 75, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 7.5, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
      '6-19': { nom: 'VSL 6-19', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 97, gaine_int_mm: 90, plaque_mm: null, entraxe_par_fcm0_mm: null, Rmin_m: 9.0, ref: 'ETA 06/0006 v5 : A_p tableau A.1.2 p. 17, R_min = 100 Ø_int (A.2.3.2 p. 23) ; gaines : brochure VSL 2009 tableau 1.4 p. 21 ; plaque et entraxe (annexe A.6) non lus' },
    },
  },
  dywidag: {
    label: 'DYWIDAG MA (ETA-13/0815)',
    document: 'ETA-13/0815 du 29.01.2021 (OIB), texte principal et annexes 1 à 7 ; ancrages MA : brochure DSI 04160-1/10.09 (base ETA-06/0022), annexes 11 à 13 de l\'ETA non lues',
    url: 'https://spennteknikk.b-cdn.net/wp-content/uploads/2023/11/ETA-MA-SYSTEM-13_0815_EN.pdf',
    rentree_mm: 8, mu: 0.20, k_rad_m: 0.005, bordEnrobage_mm: 30,
    note: 'μ = 0,20 et k = 0,005 rad/m en gaine acier I (ETA-13/0815) ; recul 8 mm sans blocage hydraulique des clavettes, 4 mm avec (brochure) : saisir g = 4 mm si le blocage est prévu. Entraxe et distance au bord donnés pour un seul niveau de résistance (f_cm,0 = 33 MPa cylindre, 40 MPa cube) : l\'ETA admet des valeurs plus faibles (annexes non lues). Distance au bord corrigée de l\'enrobage : e = e_brochure + c − 30 mm.',
    unites: {
      '6805': { nom: 'DYWIDAG 6805', torons: 5, Ap_mm2: 750, gaine_ext_mm: 57, gaine_int_mm: 50, plaque_mm: [150, 150], entraxe_par_fcm0_mm: {"33": 230}, bord_min_mm: 135, Rmin_m: 4.7, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6807': { nom: 'DYWIDAG 6807', torons: 7, Ap_mm2: 1050, gaine_ext_mm: 62, gaine_int_mm: 55, plaque_mm: [170, 170], entraxe_par_fcm0_mm: {"33": 270}, bord_min_mm: 155, Rmin_m: 6, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6809': { nom: 'DYWIDAG 6809', torons: 9, Ap_mm2: 1350, gaine_ext_mm: 72, gaine_int_mm: 65, plaque_mm: [190, 190], entraxe_par_fcm0_mm: {"33": 305}, bord_min_mm: 175, Rmin_m: 6.5, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6812': { nom: 'DYWIDAG 6812', torons: 12, Ap_mm2: 1800, gaine_ext_mm: 82, gaine_int_mm: 75, plaque_mm: [220, 220], entraxe_par_fcm0_mm: {"33": 355}, bord_min_mm: 200, Rmin_m: 7.5, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6815': { nom: 'DYWIDAG 6815', torons: 15, Ap_mm2: 2250, gaine_ext_mm: 87, gaine_int_mm: 80, plaque_mm: [250, 250], entraxe_par_fcm0_mm: {"33": 395}, bord_min_mm: 220, Rmin_m: 8.8, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6819': { nom: 'DYWIDAG 6819', torons: 19, Ap_mm2: 2850, gaine_ext_mm: 97, gaine_int_mm: 90, plaque_mm: [280, 280], entraxe_par_fcm0_mm: {"33": 445}, bord_min_mm: 245, Rmin_m: 9.9, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6822': { nom: 'DYWIDAG 6822', torons: 22, Ap_mm2: 3300, gaine_ext_mm: 102, gaine_int_mm: 95, plaque_mm: [310, 310], entraxe_par_fcm0_mm: {"33": 485}, bord_min_mm: 265, Rmin_m: 10.9, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6827': { nom: 'DYWIDAG 6827', torons: 27, Ap_mm2: 4050, gaine_ext_mm: 112, gaine_int_mm: 105, plaque_mm: [340, 340], entraxe_par_fcm0_mm: {"33": 540}, bord_min_mm: 290, Rmin_m: 12.1, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6831': { nom: 'DYWIDAG 6831', torons: 31, Ap_mm2: 4650, gaine_ext_mm: 122, gaine_int_mm: 115, plaque_mm: [420, 420], entraxe_par_fcm0_mm: {"33": 590}, bord_min_mm: 315, Rmin_m: 12.6, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
      '6837': { nom: 'DYWIDAG 6837', torons: 37, Ap_mm2: 5550, gaine_ext_mm: 137, gaine_int_mm: 130, plaque_mm: [420, 420], entraxe_par_fcm0_mm: {"33": 650}, bord_min_mm: 345, Rmin_m: 13.3, ref: 'ancrage MA Ø a, entraxe et bord (enrobage 30 mm, f_cm,0 = 33 MPa cylindre) : brochure DSI 04160-1/10.09 p. 19-20 (base ETA-06/0022) ; A_p, gaine I (annexe 3), R_min (annexe 7, p_R,max = 140 kN/m) : ETA-13/0815' },
    },
  },
  bbr: {
    label: 'BBR VT CONA CMI (ETA-06/0147)',
    document: 'ETA-06/0147 du 26.06.2025 (OIB, 137 pages), lue : frottement (tableau 3), recul (§ 1.7), entraxes et bords (§ 1.8, annexe 37), trompe-plaques (annexe 8), gaines et rayons (annexe 31)',
    url: 'https://www.bbrnetwork.com/fileadmin/userdaten/Zulassungen%20EU/CONA%20CMI%20intern/BBR_ETA-06-0147_CMI_EN_Rev10_0702.pdf',
    rentree_mm: 6, mu: 0.18, k_rad_m: 0.005, bordRegle: true,
    note: 'Gaine feuillard : μ = 0,18 (0,17 à 0,19), k = 0,005 rad/m (tableau 3, p. 20) ; recul 6 mm, 4 mm avec clavettes pré-enfoncées à environ 25 kN par toron (§ 1.7, p. 21) ; entraxe minimal a_c = b_c avec frette et étriers selon f_cm,0 cylindre = 19 / 23 / 28 / 31 / 35 MPa (annexe 37, p. 79), réduction possible de 15 % dans une direction (§ 1.8) ; distance au bord a_e = a_c/2 − 10 mm + c (§ 1.8, p. 22) ; gaine (Ø intérieur, taux de remplissage f ≈ 0,40) et rayon minimal pour p_R,max = 130 kN/m (annexe 31, p. 73) ; Ø extérieur de la gaine feuillard non donné : valeur générique.',
    unites: {
      '0406': { nom: 'BBR CONA CMI 0406', torons: 4, Ap_mm2: 600, gaine_ext_mm: null, gaine_int_mm: 45, plaque_mm: [130, 130], entraxe_par_fcm0_mm: { '19': 235, '23': 215, '28': 210, '31': 210, '35': 205 }, Rmin_m: 4.2, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '0506': { nom: 'BBR CONA CMI 0506', torons: 5, Ap_mm2: 750, gaine_ext_mm: null, gaine_int_mm: 50, plaque_mm: [170, 170], entraxe_par_fcm0_mm: { '19': 265, '23': 250, '28': 250, '31': 250, '35': 250 }, Rmin_m: 5.1, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '0606': { nom: 'BBR CONA CMI 0606', torons: 6, Ap_mm2: 900, gaine_ext_mm: null, gaine_int_mm: 55, plaque_mm: [170, 170], entraxe_par_fcm0_mm: { '19': 290, '23': 265, '28': 250, '31': 250, '35': 250 }, Rmin_m: 5.5, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '0706': { nom: 'BBR CONA CMI 0706', torons: 7, Ap_mm2: 1050, gaine_ext_mm: null, gaine_int_mm: 60, plaque_mm: [170, 170], entraxe_par_fcm0_mm: { '19': 310, '23': 285, '28': 260, '31': 255, '35': 255 }, Rmin_m: 5.9, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '0806': { nom: 'BBR CONA CMI 0806', torons: 8, Ap_mm2: 1200, gaine_ext_mm: null, gaine_int_mm: 60, plaque_mm: [195, 195], entraxe_par_fcm0_mm: { '19': 330, '23': 305, '28': 280, '31': 275, '35': 275 }, Rmin_m: 6.7, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '0906': { nom: 'BBR CONA CMI 0906', torons: 9, Ap_mm2: 1350, gaine_ext_mm: null, gaine_int_mm: 65, plaque_mm: [225, 225], entraxe_par_fcm0_mm: { '19': 350, '23': 320, '28': 310, '31': 310, '35': 310 }, Rmin_m: 7.0, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '1206': { nom: 'BBR CONA CMI 1206', torons: 12, Ap_mm2: 1800, gaine_ext_mm: null, gaine_int_mm: 75, plaque_mm: [225, 225], entraxe_par_fcm0_mm: { '19': 405, '23': 370, '28': 340, '31': 325, '35': 310 }, Rmin_m: 8.1, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '1306': { nom: 'BBR CONA CMI 1306', torons: 13, Ap_mm2: 1950, gaine_ext_mm: null, gaine_int_mm: 80, plaque_mm: [240, 240], entraxe_par_fcm0_mm: { '19': 425, '23': 390, '28': 355, '31': 340, '35': 325 }, Rmin_m: 8.2, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '1506': { nom: 'BBR CONA CMI 1506', torons: 15, Ap_mm2: 2250, gaine_ext_mm: null, gaine_int_mm: 85, plaque_mm: [280, 280], entraxe_par_fcm0_mm: { '19': 455, '23': 415, '28': 380, '31': 365, '35': 365 }, Rmin_m: 8.9, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '1606': { nom: 'BBR CONA CMI 1606', torons: 16, Ap_mm2: 2400, gaine_ext_mm: null, gaine_int_mm: 85, plaque_mm: [280, 280], entraxe_par_fcm0_mm: { '19': 470, '23': 430, '28': 390, '31': 375, '35': 365 }, Rmin_m: 9.5, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '1906': { nom: 'BBR CONA CMI 1906', torons: 19, Ap_mm2: 2850, gaine_ext_mm: null, gaine_int_mm: 95, plaque_mm: [280, 280], entraxe_par_fcm0_mm: { '19': 510, '23': 465, '28': 425, '31': 410, '35': 390 }, Rmin_m: 10.1, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '2206': { nom: 'BBR CONA CMI 2206', torons: 22, Ap_mm2: 3300, gaine_ext_mm: null, gaine_int_mm: 100, plaque_mm: [310, 310], entraxe_par_fcm0_mm: { '19': 550, '23': 500, '28': 460, '31': 440, '35': 420 }, Rmin_m: 11.1, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '2406': { nom: 'BBR CONA CMI 2406', torons: 24, Ap_mm2: 3600, gaine_ext_mm: null, gaine_int_mm: 105, plaque_mm: [325, 325], entraxe_par_fcm0_mm: { '19': 575, '23': 525, '28': 480, '31': 460, '35': 435 }, Rmin_m: 11.5, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '2506': { nom: 'BBR CONA CMI 2506', torons: 25, Ap_mm2: 3750, gaine_ext_mm: null, gaine_int_mm: 110, plaque_mm: [360, 360], entraxe_par_fcm0_mm: { '19': 590, '23': 535, '28': 485, '31': 465, '35': 450 }, Rmin_m: 11.5, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '2706': { nom: 'BBR CONA CMI 2706', torons: 27, Ap_mm2: 4050, gaine_ext_mm: null, gaine_int_mm: 115, plaque_mm: [360, 360], entraxe_par_fcm0_mm: { '19': 610, '23': 555, '28': 505, '31': 485, '35': 460 }, Rmin_m: 11.9, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
      '3106': { nom: 'BBR CONA CMI 3106', torons: 31, Ap_mm2: 4650, gaine_ext_mm: null, gaine_int_mm: 120, plaque_mm: [360, 360], entraxe_par_fcm0_mm: { '19': 650, '23': 595, '28': 545, '31': 520, '35': 495 }, Rmin_m: 13.0, ref: 'ETA-06/0147 (26.06.2025) : trompe-plaque A Ø P annexe 8 p. 50 ; entraxe minimal (frette et étriers) annexe 37 p. 79 ; gaine Ø int. et R_min (f ≈ 0,40, p_R,max = 130 kN/m) annexe 31 p. 73' },
    },
  },

};

/** Liste pour l'interface : [{ id, label, unites: [{ id, nom }] }]. */
export const agrementList = () => Object.entries(AGREMENTS).map(([id, a]) => ({ id, label: a.label, unites: Object.entries(a.unites).map(([uid, u]) => ({ id: uid, nom: u.nom, torons: u.torons })).sort((p, q) => p.torons - q.torons || (p.id < q.id ? -1 : 1)) }));

/** Unité générique de référence pour n torons : la plus petite unité générique T15 d'au moins n torons. */
function genericFor(n) {
  const G = Object.values(AGREMENTS.generique.unites).filter(u => u.Ap_mm2 / u.torons > 140).sort((p, q) => p.torons - q.torons);
  return G.find(u => u.torons >= n) || G[G.length - 1];
}

/**
 * Unité de calcul à partir d'un procédé et d'une unité ; frottement et recul : agrément, sinon BPEL annexe 3.
 * Entraxe minimal : valeur de l'agrément pour la plus grande f_cm,0 du tableau ne dépassant pas f_cj (f_cj caractéristique
 * ≤ f_cm,0 moyenne : choix prudent) ; distance au bord e = x/2 + c − 10 mm quand le procédé donne cette règle.
 * Unité absente du procédé : unité du procédé de même nombre de torons, sinon la première.
 * @param {{cas?: 'I'|'II', fcj?: number, cover?: number}} o f_cj [MPa] à la mise en tension, enrobage c [m]
 */
export function unitOf(agrId = 'generique', unitId = '12', { cas = 'I', fcj = null, cover = 0.05 } = {}) {
  const A = AGREMENTS[agrId] || AGREMENTS.generique, id = AGREMENTS[agrId] ? agrId : 'generique';
  let uid = A.unites[unitId] ? unitId : null;
  if (!uid) {
    // nombre de torons de l'unité demandée (dans n'importe quel procédé), puis unité du procédé la plus proche
    const src = Object.values(AGREMENTS).map(x => x.unites[unitId]).find(Boolean);
    const nT = src ? src.torons : 12;
    uid = Object.keys(A.unites).sort((p, q) => Math.abs(A.unites[p].torons - nT) - Math.abs(A.unites[q].torons - nT) || A.unites[q].torons - A.unites[p].torons)[0];
  }
  const u = A.unites[uid], gu = genericFor(u.torons), notes = [];
  const pick = (v, d, what) => { if (v === null || v === undefined) { if (id !== 'generique' && what) notes.push(what); return d; } return v; };
  const fB = cas === 'II' ? 0.20 : 0.18, phiB = cas === 'II' ? 0.003 : 0.002;
  const f = A.mu ?? A.f ?? fB, phi = A.mu != null && A.k_rad_m != null ? A.mu * A.k_rad_m : (A.phi ?? phiB);
  let spacingMin = null, fcm0 = null, tensionOK = true;
  if (u.entraxe_par_fcm0_mm) {
    const keys = Object.keys(u.entraxe_par_fcm0_mm).map(Number).sort((p, q) => p - q);
    const k = fcj == null ? keys[0] : (keys.filter(x => x <= fcj + 1e-9).pop() ?? keys[0]);
    if (fcj != null && fcj < keys[0] - 1e-9) tensionOK = false;
    fcm0 = k; spacingMin = u.entraxe_par_fcm0_mm[String(k)] / 1000; var fcm0Niveaux = keys.length;
  } else if (id !== 'generique') notes.push('entraxe minimal');
  const edgeMin = u.bord_min_mm && A.bordEnrobage_mm != null ? u.bord_min_mm / 1000 + cover - A.bordEnrobage_mm / 1000
    : spacingMin && A.bordRegle ? spacingMin / 2 + cover - 0.010 : null;
  const plate = u.plaque_mm ? u.plaque_mm[0] / 1000 : pick(null, gu.plaque_mm[0] / 1000, 'plaque d\'ancrage (forfait générique)');
  const plateB = u.plaque_mm ? (u.plaque_mm[1] ?? u.plaque_mm[0]) / 1000 : gu.plaque_mm[1] / 1000;
  return {
    label: u.nom, Ap: u.Ap_mm2 * 1e-6, torons: u.torons,
    phiG: pick(u.gaine_ext_mm, gu.gaine_ext_mm, 'gaine') / 1000, Rmin: pick(u.Rmin_m, gu.Rmin_m, 'rayon minimal'),
    plate, plateB, spacingMin, edgeMin, fcm0, fcm0Niveaux: typeof fcm0Niveaux === 'number' ? fcm0Niveaux : 0, tensionOK, cover,
    f, phi, g: pick(A.rentree_mm, 6, 'recul d\'ancrage (6 mm par défaut)') / 1000,
    source: A.document, url: A.url, agrNote: A.note || null, ref: u.ref || null, manquants: notes, agrement: id, unite: uid,
  };
}
