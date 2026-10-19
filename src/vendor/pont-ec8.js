//#region src/projet/stockage.ts
const estObjet = (v) => typeof v === "object" && v !== null;
/** Contrôle de forme minimal d'un projet importé ; les contrôles de cohérence restent ceux de valider(). */
function lireProjet(v) {
	if (!estObjet(v) || v.version !== 1) throw new Error("Ce fichier n'est pas un projet Pont EC8 (version 1).");
	for (const cle of [
		"site",
		"materiaux",
		"tablier",
		"options"
	]) if (!estObjet(v[cle])) throw new Error(`Section « ${cle} » absente ou invalide.`);
	const tablier = v.tablier;
	if (!Array.isArray(tablier.travees) || !tablier.travees.every((t) => typeof t === "number")) throw new Error("Liste des travées absente ou invalide.");
	if (!Array.isArray(v.appuis) || !v.appuis.every((a) => estObjet(a) && (a.type === "pile" || a.type === "culee"))) throw new Error("Liste des appuis absente ou invalide.");
	if (!estObjet(v.comportement)) v.comportement = {
		qLongitudinal: 1,
		qTransversal: 1,
		amortissement: 5,
		plateauOrigine: true
	};
	if (!estObjet(v.elastomeres)) v.elastomeres = {
		T0: 10,
		Tmin: -20,
		lambdaMaxF1: 1.1,
		lambdaMaxF2: 1.1,
		psiFi: .7
	};
	const el = v.elastomeres;
	if (typeof el.gammaIS !== "number") el.gammaIS = 1.5;
	if (typeof el.Kf !== "number") el.Kf = .6;
	if (!estObjet(v.service)) v.service = {
		retraitFluage: 4e-4,
		deltaT: 40,
		alpha: 1e-5
	};
	if (typeof tablier.chargeTrafic !== "number") tablier.chargeTrafic = 0;
	for (const a of v.appuis) {
		if (a.type === "culee" && !estObjet(a.rigide)) a.rigide = {
			longitudinal: true,
			transversal: false
		};
		const ap = a.appareils;
		if (ap && ap.type === "elastomere") {
			if (typeof ap.enrobageLateral !== "number") ap.enrobageLateral = .005;
			if (ap.fixation !== "frottement" && ap.fixation !== "mecanique") ap.fixation = "mecanique";
		}
	}
	return v;
}
//#endregion
//#region src/projet/geometrie.ts
const somme = (v) => v.reduce((a, b) => a + b, 0);
new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const positionsAppuis = (travees) => {
	const x = [0];
	for (const t of travees) x.push((x.at(-1) ?? 0) + t);
	return x;
};
function epaisseurElastomere(a) {
	return a.type === "elastomere" ? a.nbFeuillets * a.ti + 2 * a.enrobage : null;
}
function derives(p) {
	const positions = positionsAppuis(p.tablier.travees);
	const longueur = somme(p.tablier.travees);
	const beton = p.tablier.aire * p.materiaux.beton.masseVolumique * p.options.g;
	const total = beton + p.tablier.superstructures;
	const masseLineique = total / p.options.g;
	const { zone, categorie } = p.site;
	const soumis = zone === 1 ? {
		soumis: false,
		motif: "Zone de sismicité 1 : pont non soumis aux règles parasismiques (arrêté du 26/10/2011, art. 3)."
	} : categorie === "I" ? {
		soumis: false,
		motif: "Catégorie d'importance I : pont non soumis aux règles parasismiques (arrêté du 26/10/2011, art. 3)."
	} : {
		soumis: true,
		motif: `Zone ${zone}, catégorie ${categorie} : règles de l'Eurocode 8 applicables (arrêté du 26/10/2011, art. 3 et 4).`
	};
	return {
		positions,
		longueur,
		longueurTablier: longueur + 2 * p.tablier.debordAbout,
		poidsLineique: {
			beton,
			superstructures: p.tablier.superstructures,
			total
		},
		masseLineique,
		masseTablier: masseLineique * longueur,
		soumis
	};
}
/** Inerties de flexion du tablier (m⁴) pour l'analyse multimodale, avec l'origine de chaque valeur. */
function inertiesTablier(p) {
	const { aire, epaisseur, largeur, inertieVerticale, inertieTransversale } = p.tablier;
	const sv = typeof inertieVerticale === "number" && inertieVerticale > 0;
	const st = typeof inertieTransversale === "number" && inertieTransversale > 0;
	return {
		verticale: sv ? inertieVerticale : aire * epaisseur ** 2 / 12,
		transversale: st ? inertieTransversale : aire * largeur ** 2 / 12,
		saisie: {
			verticale: sv,
			transversale: st
		}
	};
}
//#endregion
//#region src/projet/validation.ts
const fr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
function positifs(cible, valeurs, sortie) {
	for (const [nom, v] of Object.entries(valeurs)) if (!Number.isFinite(v) || v <= 0) sortie.push({
		niveau: "erreur",
		cible,
		message: `${nom} doit être un nombre strictement positif.`
	});
}
function controlerAppareils(appui, a, sortie) {
	if (!Number.isInteger(a.nombre) || a.nombre < 1) sortie.push({
		niveau: "erreur",
		cible: appui.id,
		message: "Le nombre d'appareils d'appui doit être un entier au moins égal à 1."
	});
	positifs(appui.id, {
		"La dimension a de l'appareil": a.a,
		"La dimension b de l'appareil": a.b
	}, sortie);
	if (a.type === "elastomere") {
		positifs(appui.id, {
			"L'épaisseur d'un feuillet": a.ti,
			"Le module Gg": a.Gg
		}, sortie);
		if (!Number.isInteger(a.nbFeuillets) || a.nbFeuillets < 1) sortie.push({
			niveau: "erreur",
			cible: appui.id,
			message: "Le nombre de feuillets doit être un entier au moins égal à 1."
		});
		const tq = epaisseurElastomere(a) ?? 0;
		if (tq > 0 && Math.min(a.a, a.b) / tq < 3) sortie.push({
			niveau: "alerte",
			cible: appui.id,
			message: `Appareil très élancé : épaisseur d'élastomère ${fr.format(tq)} m pour un côté de ${fr.format(Math.min(a.a, a.b))} m.`
		});
		if (a.Gg < .7 || a.Gg > 1.2) sortie.push({
			niveau: "alerte",
			cible: appui.id,
			message: `Module Gg inhabituel (${fr.format(a.Gg)} MPa) ; valeur conventionnelle courante : 0,9 MPa.`
		});
	} else positifs(appui.id, { "La hauteur de l'appareil": a.hauteur }, sortie);
}
function valider(p) {
	const sortie = [];
	const { tablier, appuis, site } = p;
	if (site.zone === 1 || site.categorie === "I") sortie.push({
		niveau: "info",
		cible: "site",
		message: "Zone 1 ou catégorie I : le pont n'est pas soumis aux règles parasismiques (arrêté du 26/10/2011, art. 3). Le calcul reste possible à titre indicatif."
	});
	if (!(site.ST >= 1)) sortie.push({
		niveau: "erreur",
		cible: "site",
		message: "Le coefficient topographique S_T doit être au moins égal à 1."
	});
	const c = p.comportement;
	for (const [nom, q] of [["longitudinal", c.qLongitudinal], ["transversal", c.qTransversal]]) if (!(q >= 1)) sortie.push({
		niveau: "erreur",
		cible: "comportement",
		message: `Le coefficient de comportement ${nom} doit être au moins égal à 1.`
	});
	else if (q > 1.5) sortie.push({
		niveau: "alerte",
		cible: "comportement",
		message: `q ${nom} = ${fr.format(q)} > 1,5 : conception ductile, hors du périmètre de la V1 (dimensionnement en capacité non traité).`
	});
	const surElastomeres = appuis.length > 0 && appuis.every((a) => a.appareils.type === "elastomere");
	if (surElastomeres && c.qLongitudinal > 1) sortie.push({
		niveau: "alerte",
		cible: "comportement",
		message: "Tablier entièrement sur appareils en élastomère : le guide retient q = 1 dans la direction longitudinale."
	});
	if (surElastomeres && c.qTransversal > 1 && !appuis.some((a) => a.butees.transversales)) sortie.push({
		niveau: "alerte",
		cible: "comportement",
		message: "Aucun blocage transversal : avec des appareils en élastomère seuls, le guide retient q = 1 dans la direction transversale."
	});
	if (!(c.amortissement > 0 && c.amortissement <= 30)) sortie.push({
		niveau: "erreur",
		cible: "comportement",
		message: "L'amortissement doit être compris entre 0 et 30 %."
	});
	positifs("matériaux", {
		"fck": p.materiaux.beton.fck,
		"La masse volumique du béton": p.materiaux.beton.masseVolumique,
		"fyk": p.materiaux.acier.fyk
	}, sortie);
	if (!(p.options.g > 9 && p.options.g < 11)) sortie.push({
		niveau: "erreur",
		cible: "options",
		message: "g doit être compris entre 9 et 11 m/s²."
	});
	if (tablier.travees.length < 1) sortie.push({
		niveau: "erreur",
		cible: "tablier",
		message: "Le tablier doit comporter au moins une travée."
	});
	tablier.travees.forEach((t, i) => {
		if (!(t > 0)) sortie.push({
			niveau: "erreur",
			cible: "tablier",
			message: `La portée de la travée ${i + 1} doit être strictement positive.`
		});
	});
	positifs("tablier", {
		"La largeur du tablier": tablier.largeur,
		"L'épaisseur du tablier": tablier.epaisseur,
		"L'aire de la section": tablier.aire
	}, sortie);
	if (tablier.aire > tablier.largeur * tablier.epaisseur * 1.001) sortie.push({
		niveau: "alerte",
		cible: "tablier",
		message: "L'aire de la section dépasse largeur × épaisseur."
	});
	if (tablier.superstructures < 0) sortie.push({
		niveau: "erreur",
		cible: "tablier",
		message: "Le poids des superstructures ne peut pas être négatif."
	});
	if (tablier.debordAbout < 0) sortie.push({
		niveau: "erreur",
		cible: "tablier",
		message: "Le débord d'about ne peut pas être négatif."
	});
	for (const [cle, nom] of [["inertieVerticale", "L'inertie de flexion verticale"], ["inertieTransversale", "L'inertie de flexion transversale"]]) {
		const v = tablier[cle];
		if (v !== void 0 && !(v > 0)) sortie.push({
			niveau: "erreur",
			cible: "tablier",
			message: `${nom} du tablier doit être strictement positive (laisser vide pour la valeur par défaut).`
		});
	}
	if (appuis.length !== tablier.travees.length + 1) sortie.push({
		niveau: "erreur",
		cible: "appuis",
		message: `Il faut ${tablier.travees.length + 1} appuis pour ${tablier.travees.length} travée(s) ; ${appuis.length} sont définis.`
	});
	appuis.forEach((appui, i) => {
		const extremite = i === 0 || i === appuis.length - 1;
		if (extremite && appui.type !== "culee") sortie.push({
			niveau: "erreur",
			cible: appui.id,
			message: "Les appuis d'extrémité doivent être des culées."
		});
		if (!extremite && appui.type !== "pile") sortie.push({
			niveau: "erreur",
			cible: appui.id,
			message: "Les appuis intermédiaires doivent être des piles."
		});
	});
	const ids = appuis.map((a) => a.id);
	if (new Set(ids).size !== ids.length) sortie.push({
		niveau: "erreur",
		cible: "appuis",
		message: "Deux appuis portent le même nom."
	});
	for (const appui of appuis) {
		controlerAppareils(appui, appui.appareils, sortie);
		if (appui.type === "pile") {
			const { futs, semelle } = appui;
			positifs(appui.id, {
				"La hauteur des fûts": futs.hauteur,
				"La dimension longitudinale des fûts": futs.long,
				"La dimension transversale des fûts": futs.trans
			}, sortie);
			positifs(appui.id, {
				"La semelle (longueur)": semelle.long,
				"La semelle (largeur)": semelle.trans,
				"La semelle (épaisseur)": semelle.epaisseur
			}, sortie);
			if (!Number.isInteger(futs.nombre) || futs.nombre < 1) sortie.push({
				niveau: "erreur",
				cible: appui.id,
				message: "Le nombre de fûts doit être un entier au moins égal à 1."
			});
			const largeurFuts = (futs.nombre - 1) * futs.entraxe + (futs.forme === "circulaire" ? futs.long : futs.trans);
			if (futs.nombre > 1 && futs.entraxe < (futs.forme === "circulaire" ? futs.long : futs.trans)) sortie.push({
				niveau: "erreur",
				cible: appui.id,
				message: "L'entraxe des fûts est inférieur à leur largeur : les fûts se chevauchent."
			});
			if (largeurFuts > tablier.largeur) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: `Les fûts (${fr.format(largeurFuts)} m) débordent de la largeur du tablier.`
			});
			if (semelle.long < futs.long || semelle.trans < largeurFuts) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: "La semelle ne couvre pas l'emprise des fûts."
			});
			if (appui.appareils.a > futs.long) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: "Les appareils d'appui débordent de l'épaisseur des fûts."
			});
			if (appui.appareils.nombre % futs.nombre !== 0) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: "Le nombre d'appareils n'est pas un multiple du nombre de fûts : répartition uniforme sur la largeur."
			});
			if (appui.armatures) {
				const { As, db, enrobage, rhoW } = appui.armatures;
				if (!(As > 0) || !(db > 0) || !(enrobage > 0)) sortie.push({
					niveau: "erreur",
					cible: appui.id,
					message: "Armatures des fûts : As, le diamètre des barres et l'enrobage doivent être strictement positifs."
				});
				if (rhoW !== void 0 && !(rhoW >= 0)) sortie.push({
					niveau: "erreur",
					cible: appui.id,
					message: "Le taux d'armatures transversales ρw ne peut pas être négatif."
				});
				if (enrobage > 0 && 2 * enrobage >= Math.min(futs.long, futs.forme === "circulaire" ? futs.long : futs.trans)) sortie.push({
					niveau: "erreur",
					cible: appui.id,
					message: "L'enrobage des armatures dépasse la demi-épaisseur du fût."
				});
			}
			if (appui.facteurInertie !== void 0 && !(appui.facteurInertie > 0 && appui.facteurInertie <= 1)) sortie.push({
				niveau: "erreur",
				cible: appui.id,
				message: "Le facteur d'inertie effective des fûts doit être compris entre 0 et 1."
			});
			if (futs.hauteur / Math.min(futs.long, futs.forme === "circulaire" ? futs.long : futs.trans) > 25) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: "Fûts très élancés : vérifier la pertinence de la méthode du mode fondamental et les effets du second ordre."
			});
		} else {
			const { poteaux, sommier, semelle } = appui;
			positifs(appui.id, {
				"La hauteur des poteaux": poteaux.hauteur,
				"Le côté des poteaux": poteaux.cote,
				"Le sommier (longueur)": sommier.long,
				"Le sommier (hauteur)": sommier.haut,
				"Le sommier (largeur)": sommier.trans
			}, sortie);
			positifs(appui.id, {
				"La semelle (longueur)": semelle.long,
				"La semelle (largeur)": semelle.trans,
				"La semelle (épaisseur)": semelle.epaisseur
			}, sortie);
			if (!Number.isInteger(poteaux.nombre) || poteaux.nombre < 1) sortie.push({
				niveau: "erreur",
				cible: appui.id,
				message: "Le nombre de poteaux doit être un entier au moins égal à 1."
			});
			if (poteaux.nombre > 1 && poteaux.entraxe < poteaux.cote) sortie.push({
				niveau: "erreur",
				cible: appui.id,
				message: "L'entraxe des poteaux est inférieur à leur côté."
			});
			const faceGardeGreve = sommier.long - poteaux.cote / 2 - sommier.debordAvant - appui.gardeGreve.retrait - appui.gardeGreve.epaisseur;
			if (appui.excentrementAppui + appui.appareils.a / 2 > faceGardeGreve) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: "L'appareil d'appui empiète sur le mur garde-grève."
			});
			if (appui.excentrementAppui + tablier.debordAbout >= faceGardeGreve) sortie.push({
				niveau: "alerte",
				cible: appui.id,
				message: "Le tablier touche le mur garde-grève : réduire le débord d'about ou reculer le garde-grève."
			});
		}
	}
	return sortie;
}
//#endregion
//#region src/referentiel/action.ts
const AG = {
	id: "ag",
	type: "formule",
	etape: "action_sismique",
	libelle: "Accélération horizontale de calcul au rocher",
	latex: "a_g = \\gamma_I \\cdot a_{gR}",
	variables: [{
		symbole: "\\gamma_I",
		description: "coefficient d'importance",
		unite: "-"
	}, {
		symbole: "a_{gR}",
		description: "accélération maximale de référence au rocher",
		unite: "m/s²"
	}],
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 4 II b)"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.2",
		page: "73"
	}],
	statut: "verifie"
};
const AVG = {
	id: "avg",
	type: "formule",
	etape: "action_sismique",
	libelle: "Accélération verticale de calcul",
	latex: "a_{vg} = 0{,}90\\,a_g \\ \\text{(zones 2 à 4)}, \\qquad a_{vg} = 0{,}80\\,a_g \\ \\text{(zone 5)}",
	variables: [{
		symbole: "a_g",
		description: "accélération horizontale de calcul au rocher",
		unite: "m/s²"
	}],
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 4 II e)"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.2",
		page: "73"
	}],
	statut: "via_guide"
};
const ETA = {
	id: "eta",
	type: "formule",
	etape: "action_sismique",
	libelle: "Coefficient de correction de l'amortissement",
	latex: "\\eta = \\sqrt{\\dfrac{10}{5 + \\xi}} \\ge 0{,}55",
	variables: [{
		symbole: "\\xi",
		description: "coefficient d'amortissement visqueux",
		unite: "%"
	}],
	references: [{
		source: "NF_EN_1998_1",
		localisation: "3.2.2.2(3), éq. (3.6)",
		page: "34"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.5",
		page: "79"
	}],
	statut: "via_guide",
	note: "η = 1 pour ξ = 5 %."
};
const SE = {
	id: "Se",
	type: "formule",
	etape: "action_sismique",
	libelle: "Spectre de réponse élastique horizontal",
	latex: "S_e(T) = a_g\\,S\\,S_T \\times \\begin{cases} 1 + \\dfrac{T}{T_B}\\,(2{,}5\\,\\eta - 1) & 0 \\le T \\le T_B \\\\[4pt] 2{,}5\\,\\eta & T_B \\le T \\le T_C \\\\[4pt] 2{,}5\\,\\eta\\,\\dfrac{T_C}{T} & T_C \\le T \\le T_D \\\\[4pt] 2{,}5\\,\\eta\\,\\dfrac{T_C\\,T_D}{T^2} & T_D \\le T \\le 4\\ \\text{s} \\end{cases}",
	variables: [
		{
			symbole: "T",
			description: "période de vibration d'un oscillateur linéaire à un degré de liberté",
			unite: "s"
		},
		{
			symbole: "S",
			description: "paramètre de sol",
			unite: "-"
		},
		{
			symbole: "S_T",
			description: "coefficient d'amplification topographique",
			unite: "-"
		},
		{
			symbole: "T_B,\\,T_C,\\,T_D",
			description: "périodes de coin du spectre",
			unite: "s"
		}
	],
	conditions: ["Valable pour T ≤ 4 s ; au-delà, utiliser le spectre en déplacement."],
	references: [{
		source: "NF_EN_1998_1",
		localisation: "3.2.2.2(1)P, éq. (3.2) à (3.5)",
		page: "32"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.5",
		page: "79"
	}],
	statut: "via_guide",
	note: "Le guide intègre S_T dans l'expression ; l'EN 1998-1 l'écrit sans S_T, introduit par l'EN 1998-5 annexe A."
};
const SVE = {
	id: "Sve",
	type: "formule",
	etape: "action_sismique",
	libelle: "Spectre de réponse élastique vertical",
	latex: "S_{ve}(T) = a_{vg}\\,S_T \\times \\begin{cases} 1 + \\dfrac{T}{T_B}\\,(3{,}0\\,\\eta - 1) & 0 \\le T \\le T_B \\\\[4pt] 3{,}0\\,\\eta & T_B \\le T \\le T_C \\\\[4pt] 3{,}0\\,\\eta\\,\\dfrac{T_C}{T} & T_C \\le T \\le T_D \\\\[4pt] 3{,}0\\,\\eta\\,\\dfrac{T_C\\,T_D}{T^2} & T_D \\le T \\le 4\\ \\text{s} \\end{cases}",
	variables: [{
		symbole: "a_{vg}",
		description: "accélération verticale de calcul",
		unite: "m/s²"
	}, {
		symbole: "T_B,\\,T_C,\\,T_D",
		description: "périodes de coin du spectre vertical (indépendantes du sol)",
		unite: "s"
	}],
	references: [{
		source: "NF_EN_1998_1",
		localisation: "3.2.2.3(1)P, éq. (3.8) à (3.11)",
		page: "35"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.5",
		page: "81"
	}],
	statut: "via_guide",
	note: "Composante verticale : q = 1, on utilise ce spectre élastique (voir q_vertical)."
};
const SD = {
	id: "Sd",
	type: "formule",
	etape: "action_sismique",
	libelle: "Spectre de calcul horizontal pour l'analyse élastique",
	latex: "S_d(T) = a_g\\,S\\,S_T \\times \\begin{cases} \\dfrac{2}{3} + \\dfrac{T}{T_B}\\left(\\dfrac{2{,}5}{q} - \\dfrac{2}{3}\\right) & 0 \\le T \\le T_B \\\\[6pt] \\dfrac{2{,}5}{q} & T_B \\le T \\le T_C \\\\[6pt] \\dfrac{2{,}5}{q}\\,\\dfrac{T_C}{T} & T_C \\le T \\le T_D \\\\[6pt] \\dfrac{2{,}5}{q}\\,\\dfrac{T_C\\,T_D}{T^2} & T_D \\le T \\end{cases} \\qquad S_d(T) \\ge \\beta\\,a_g \\ \\text{pour}\\ T \\ge T_C",
	variables: [{
		symbole: "q",
		description: "coefficient de comportement",
		unite: "-"
	}, {
		symbole: "\\beta",
		description: "coefficient de limite inférieure du spectre de calcul",
		unite: "-"
	}],
	references: [{
		source: "NF_EN_1998_1",
		localisation: "3.2.2.5(4)P, éq. (3.13) à (3.16)",
		page: "36"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.5",
		page: "82"
	}],
	statut: "via_guide",
	note: "η n'apparaît pas : il est intégré implicitement dans q."
};
const BETA = {
	id: "beta",
	type: "scalaire",
	etape: "action_sismique",
	libelle: "Limite inférieure du spectre de calcul horizontal",
	symbole: "\\beta",
	unite: "-",
	valeur: .2,
	references: [
		{
			source: "NF_EN_1998_1",
			localisation: "3.2.2.5(4)P, note (valeur recommandée β = 0,2)",
			page: "36"
		},
		{
			source: "NF_EN_1998_1_NA",
			localisation: "3.2.2.5(4)P",
			page: "7"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5",
			page: "82"
		}
	],
	statut: "via_guide",
	note: "L'AN de l'EN 1998-1 renvoie aux AN des autres parties pour les ouvrages autres que les bâtiments ; l'AN de l'EN 1998-2 ne fixe pas β. Le guide retient la valeur recommandée 0,2."
};
const SDE = {
	id: "SDe",
	type: "formule",
	etape: "action_sismique",
	libelle: "Spectre de réponse élastique en déplacement",
	latex: "S_{De}(T) = S_e(T)\\left(\\dfrac{T}{2\\pi}\\right)^2",
	variables: [{
		symbole: "S_e(T)",
		description: "spectre élastique horizontal en accélération",
		unite: "m/s²"
	}],
	conditions: ["Valable pour T ≤ 4 s."],
	references: [{
		source: "NF_EN_1998_1",
		localisation: "3.2.2.2(5)P et (6), éq. (3.7)",
		page: "35"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.5",
		page: "84"
	}],
	statut: "via_guide"
};
const SDE_LONGUES_PERIODES = {
	id: "SDe_longues_periodes",
	type: "formule",
	etape: "action_sismique",
	libelle: "Spectre élastique en déplacement aux longues périodes",
	latex: "S_{De}(T) = \\begin{cases} 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D \\left[2{,}5\\,\\eta + \\dfrac{T - T_E}{T_F - T_E}\\,(1 - 2{,}5\\,\\eta)\\right] & T_E \\le T \\le T_F \\\\[6pt] d_g & T \\ge T_F \\end{cases}",
	variables: [{
		symbole: "T_E,\\,T_F",
		description: "périodes de coin du spectre en déplacement",
		unite: "s"
	}],
	references: [
		{
			source: "NF_EN_1998_1",
			localisation: "annexe A (informative), A.2, éq. (A.1) et (A.2)",
			page: "169"
		},
		{
			source: "NF_EN_1998_1_NA",
			localisation: "AN 2",
			page: "18"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5",
			page: "84"
		}
	],
	statut: "via_guide",
	note: "Annexe informative. Entre 4 s et T_E, l'EN 1998-1 (A.2) prolonge les expressions (3.2) à (3.5) converties par (3.7) : S_De reste constant au-delà de T_D jusqu'à T_E."
};
const TE_TF = {
	id: "TE_TF",
	type: "table",
	etape: "action_sismique",
	libelle: "Périodes de coin du spectre en déplacement",
	symbole: "T_E,\\ T_F",
	unite: "s",
	cles: ["classe de sol"],
	valeurs: {
		A: {
			TE: 4.5,
			TF: 10
		},
		B: {
			TE: 5,
			TF: 10
		},
		C: {
			TE: 6,
			TF: 10
		},
		D: {
			TE: 6,
			TF: 10
		},
		E: {
			TE: 6,
			TF: 10
		}
	},
	references: [{
		source: "NF_EN_1998_1",
		localisation: "annexe A, tableau A.1",
		page: "169"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §2.5, tableau 14",
		page: "84"
	}],
	statut: "via_guide"
};
const ACTION = [
	{
		id: "plateau_origine",
		type: "regle",
		etape: "action_sismique",
		libelle: "Prolongement du plateau des spectres jusqu'à T = 0",
		enonce: "Le guide recommande de prolonger le plateau des spectres (élastiques, de calcul et vertical) jusqu'à l'origine, pour couvrir les incertitudes sur les périodes propres (fondations supposées rigides, inerties brutes non fissurées).",
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5 ; annexe 1 §1.7.3",
			page: "83, 246"
		}],
		statut: "via_guide",
		note: "Recommandation du guide, plus sévère que la forme de l'EN 1998-1 pour T < T_B."
	},
	AG,
	AVG,
	ETA,
	SE,
	SVE,
	SD,
	BETA,
	SDE,
	SDE_LONGUES_PERIODES,
	TE_TF,
	{
		id: "dg",
		type: "formule",
		etape: "action_sismique",
		libelle: "Déplacement de calcul du sol",
		latex: "d_g = 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D",
		variables: [{
			symbole: "a_g",
			description: "accélération horizontale de calcul au rocher",
			unite: "m/s²"
		}, {
			symbole: "T_C,\\,T_D",
			description: "périodes de coin du spectre horizontal",
			unite: "s"
		}],
		references: [{
			source: "NF_EN_1998_1",
			localisation: "3.2.2.4(1), éq. (3.12)",
			page: "35"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5",
			page: "84"
		}],
		statut: "via_guide",
		note: "Le guide inclut S_T, absent de l'expression de l'EN 1998-1."
	},
	{
		id: "vs30",
		type: "formule",
		etape: "action_sismique",
		libelle: "Vitesse moyenne des ondes de cisaillement sur les 30 m supérieurs",
		latex: "v_{s,30} = \\dfrac{30}{\\displaystyle\\sum_{i=1}^{N} \\frac{h_i}{v_i}}",
		variables: [{
			symbole: "h_i",
			description: "épaisseur de la couche i (sur les 30 premiers mètres)",
			unite: "m"
		}, {
			symbole: "v_i",
			description: "vitesse des ondes de cisaillement dans la couche i",
			unite: "m/s"
		}],
		references: [{
			source: "NF_EN_1998_1",
			localisation: "3.1.2(3), éq. (3.1)",
			page: "30"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.3",
			page: "75"
		}],
		statut: "via_guide"
	},
	{
		id: "classes_sol",
		type: "table",
		etape: "action_sismique",
		libelle: "Classes de sol : bornes de vs,30, NSPT et cu",
		symbole: "v_{s,30},\\ N_{SPT},\\ c_u",
		unite: "m/s, coups/30 cm, kPa",
		cles: ["classe de sol"],
		valeurs: {
			A: {
				vs30: "> 800",
				NSPT: "—",
				cu: "—"
			},
			B: {
				vs30: "360 – 800",
				NSPT: "> 50",
				cu: "> 250"
			},
			C: {
				vs30: "180 – 360",
				NSPT: "15 – 50",
				cu: "70 – 250"
			},
			D: {
				vs30: "< 180",
				NSPT: "< 15",
				cu: "< 70"
			},
			E: {
				vs30: "alluvions C ou D de 5 à 20 m sur un substratum à vs > 800",
				NSPT: "—",
				cu: "—"
			}
		},
		references: [{
			source: "NF_EN_1998_1",
			localisation: "3.1.2(1), tableau 3.1",
			page: "29-30"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.3, tableau 8",
			page: "74"
		}],
		statut: "via_guide",
		note: "Classes S1 (argiles molles, vases) et S2 (sols liquéfiables, argiles sensibles) : études particulières. Le guide ajoute des valeurs indicatives pressiométriques et pénétrométriques."
	},
	{
		id: "classe_sol_defavorable",
		type: "regle",
		etape: "action_sismique",
		libelle: "Doute sur la classe de sol ou sols différents sous les appuis",
		enonce: "Retenir la situation la plus défavorable : classe déclassée ou enveloppe des spectres, et une action unique correspondant au sol le plus défavorable sous tous les appuis.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "3.2.2.1 et 3.3(4)",
			page: "36"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.3 et §3.4",
			page: "76, 91"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 3.2.2.1(1)P renvoie à 3.3 lorsque plusieurs classes de sol se rencontrent sous les appuis, et 3.3(4) impose une action unique correspondant au sol le plus défavorable. Le déclassement en cas de doute et l'enveloppe des spectres sont du guide."
	},
	{
		id: "ST",
		type: "regle",
		etape: "action_sismique",
		libelle: "Coefficient d'amplification topographique S_T",
		enonce: "Pentes de hauteur > 30 m et d'inclinaison > 15° : S_T ≥ 1,2 pour un versant ou une pente isolée près de la crête ; S_T ≥ 1,4 pour une butte à crête étroite de pente moyenne > 30° (≥ 1,2 si < 30°) ; majoration de 20 % en présence d'une couche lâche en surface ; variation linéaire depuis la base, où S_T = 1. Sinon S_T = 1. S_T multiplie l'accélération de calcul.",
		references: [
			{
				source: "NF_EN_1998_5",
				localisation: "annexe A",
				etat: "citee_par_guide"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 4 §2.4",
				page: "78"
			},
			{
				source: "NF_EN_1998_5_NA",
				localisation: "AN 1, clause 1.1(4), et AN 2 (annexe A informative en France)",
				page: "5",
				etat: "lue_projet"
			}
		],
		statut: "via_guide"
	}
];
//#endregion
//#region src/referentiel/nationaux.ts
const groupeDeZone = (zone) => zone === 5 ? "zone_5" : "zones_2_a_4";
const CHAMP_APPLICATION = {
	id: "champ_application",
	type: "regle",
	etape: "classification",
	libelle: "Ouvrages visés",
	enonce: "Ponts nouveaux définitifs, passerelles comprises, publics ou privés, et murs de soutènement qui leur sont solidaires.",
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 1er"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "Introduction §2.2.3",
		page: "11"
	}],
	statut: "verifie"
};
const CATEGORIES_IMPORTANCE = {
	id: "categories_importance",
	type: "regle",
	etape: "classification",
	libelle: "Catégories d'importance des ponts",
	enonce: "I : pont privé ne desservant pas d'ERP. II : pont public, ou privé desservant un ERP, non classé III ou IV. III : pont public portant, franchissant ou longeant une autoroute, une route express, une voie à grande circulation ou une LGV ; ponts-canaux ; ponts des ports ; ponts d'aérodromes non classés IV. IV : ponts de pistes ou de voies d'aéronefs de code C à F ; ponts primordiaux pour la sécurité civile, la défense ou l'ordre public (classement préfectoral) ; pont II ou III dont l'endommagement menacerait un ouvrage de catégorie IV.",
	references: [
		{
			source: "ARRETE_2011",
			localisation: "art. 2"
		},
		{
			source: "NF_EN_1998_2_NA",
			localisation: "2.1(4)P",
			page: "9"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "11-12"
		}
	],
	statut: "verifie",
	note: "L'AN renvoie à l'Administration française pour la définition des catégories."
};
const EXEMPTION = {
	id: "exemption",
	type: "regle",
	etape: "classification",
	libelle: "Ponts non soumis aux règles parasismiques",
	enonce: "Les ponts de catégorie II, III ou IV situés en zones 2 à 5 doivent appliquer les règles de l'article 4. Les ponts de catégorie I, ou situés en zone 1, n'y sont pas soumis.",
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 3, al. 1 et 3"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "Introduction §2.2.3",
		page: "12"
	}],
	statut: "verifie"
};
const FONDATIONS_DEUX_ZONES = {
	id: "fondations_deux_zones",
	type: "regle",
	etape: "classification",
	libelle: "Pont fondé sur deux zones de sismicité",
	enonce: "Un pont dont les fondations sont dans deux zones de sismicité est considéré tout entier dans la zone la plus élevée.",
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 3, al. 2"
	}],
	statut: "verifie",
	note: "Alinéa non repris dans l'extrait de l'arrêté donné par le guide Cerema."
};
const REGLES_APPLICABLES = {
	id: "regles_applicables",
	type: "regle",
	etape: "classification",
	libelle: "Normes à appliquer",
	enonce: "NF EN 1998-2, NF EN 1998-1 et NF EN 1998-5, avec leurs annexes nationales.",
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 4 I"
	}],
	statut: "verifie"
};
const SEISME_ACCIDENTEL = {
	id: "seisme_action_accidentelle",
	type: "regle",
	etape: "classification",
	libelle: "Nature de l'action sismique",
	enonce: "L'action sismique est une action accidentelle ; les exigences de 2.2.2(3) et 2.2.2(4) sont conservées.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "2.2.2(5)",
		page: "9"
	}],
	statut: "verifie"
};
const GAMMA_I = {
	id: "gamma_I",
	type: "table",
	etape: "classification",
	libelle: "Coefficient d'importance",
	symbole: "\\gamma_I",
	unite: "-",
	cles: ["catégorie d'importance"],
	valeurs: {
		II: 1,
		III: 1.2,
		IV: 1.4
	},
	references: [
		{
			source: "ARRETE_2011",
			localisation: "art. 4 I, tableau"
		},
		{
			source: "NF_EN_1998_2_NA",
			localisation: "2.1(6)",
			page: "9"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "12"
		}
	],
	statut: "via_guide"
};
const AGR = {
	id: "agr",
	type: "table",
	etape: "action_sismique",
	libelle: "Accélération maximale de référence au rocher (sol de classe A)",
	symbole: "a_{gR}",
	unite: "m/s²",
	cles: ["zone de sismicité"],
	valeurs: {
		2: .7,
		3: 1.1,
		4: 1.6,
		5: 3
	},
	references: [
		{
			source: "ARRETE_2011",
			localisation: "art. 4 II a)"
		},
		{
			source: "NF_EN_1998_1_NA",
			localisation: "3.2.1(2)",
			page: "6"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "12"
		}
	],
	statut: "via_guide"
};
const PARAMETRE_SOL_S = {
	id: "S",
	type: "table",
	etape: "action_sismique",
	libelle: "Paramètre de sol (composantes horizontales)",
	symbole: "S",
	unite: "-",
	cles: ["groupe de zones", "classe de sol"],
	valeurs: {
		zones_2_a_4: {
			A: 1,
			B: 1.35,
			C: 1.5,
			D: 1.6,
			E: 1.8
		},
		zone_5: {
			A: 1,
			B: 1.2,
			C: 1.15,
			D: 1.35,
			E: 1.4
		}
	},
	references: [
		{
			source: "ARRETE_2011",
			localisation: "art. 4 II c)"
		},
		{
			source: "NF_EN_1998_1_NA",
			localisation: "3.1.2(1) et 3.2.2.2(2)P",
			page: "6-7"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "12"
		}
	],
	statut: "via_guide",
	note: "La classe de sol est définie au tableau 3.1 de NF EN 1998-1."
};
const SOL_ET_VERTICAL = {
	id: "sol_composante_verticale",
	type: "regle",
	etape: "action_sismique",
	libelle: "Composante verticale indépendante du sol",
	enonce: "La nature du sol n'est pas prise en compte pour la composante verticale de l'action sismique.",
	references: [{
		source: "ARRETE_2011",
		localisation: "art. 4 II c)"
	}],
	statut: "verifie"
};
const PERIODES_HORIZONTALES = {
	id: "periodes_horizontales",
	type: "table",
	etape: "action_sismique",
	libelle: "Périodes de coin du spectre élastique horizontal",
	symbole: "T_B,\\ T_C,\\ T_D",
	unite: "s",
	cles: ["groupe de zones", "classe de sol"],
	valeurs: {
		zones_2_a_4: {
			A: {
				TB: .03,
				TC: .2,
				TD: 2.5
			},
			B: {
				TB: .05,
				TC: .25,
				TD: 2.5
			},
			C: {
				TB: .06,
				TC: .4,
				TD: 2
			},
			D: {
				TB: .1,
				TC: .6,
				TD: 1.5
			},
			E: {
				TB: .08,
				TC: .45,
				TD: 1.25
			}
		},
		zone_5: {
			A: {
				TB: .15,
				TC: .4,
				TD: 2
			},
			B: {
				TB: .15,
				TC: .5,
				TD: 2
			},
			C: {
				TB: .2,
				TC: .6,
				TD: 2
			},
			D: {
				TB: .2,
				TC: .8,
				TD: 2
			},
			E: {
				TB: .15,
				TC: .5,
				TD: 2
			}
		}
	},
	references: [
		{
			source: "ARRETE_2011",
			localisation: "art. 4 II d)"
		},
		{
			source: "NF_EN_1998_1_NA",
			localisation: "3.2.2.2(2)P",
			page: "7"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "13"
		}
	],
	statut: "via_guide"
};
const SPECTRE_VERTICAL = {
	id: "spectre_vertical",
	type: "table",
	etape: "action_sismique",
	libelle: "Paramètres du spectre élastique vertical",
	symbole: "a_{vg}/a_g,\\ T_B,\\ T_C,\\ T_D",
	unite: "-, s",
	cles: ["groupe de zones"],
	valeurs: {
		zones_2_a_4: {
			rapport: .9,
			TB: .03,
			TC: .2,
			TD: 2.5
		},
		zone_5: {
			rapport: .8,
			TB: .15,
			TC: .4,
			TD: 2
		}
	},
	references: [
		{
			source: "ARRETE_2011",
			localisation: "art. 4 II e)"
		},
		{
			source: "NF_EN_1998_1_NA",
			localisation: "3.2.2.3(1)P",
			page: "7"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "13"
		}
	],
	statut: "via_guide"
};
const SOL_PAR_DEFAUT = {
	id: "classe_sol_par_defaut",
	type: "regle",
	etape: "action_sismique",
	libelle: "Classification du sol sans investigations complémentaires",
	enonce: "Paramètres de sol par défaut admis pour classer le sol (A à E) en cas de faible sismicité, ou pour les ouvrages de catégorie I ou II si le maître d'œuvre juge la reconnaissance suffisante (sauf prescription contraire de l'Administration). Des corrélations vs / pénétromètre / pressiomètre sont admises (EN 1998-5 4.2.2(6)).",
	references: [{
		source: "NF_EN_1998_1_NA",
		localisation: "3.1.1(4)",
		page: "6"
	}],
	statut: "verifie"
};
const RHO_0 = {
	id: "rho_0",
	type: "scalaire",
	etape: "comportement",
	libelle: "Limite du rapport ρ au-delà de laquelle le comportement est irrégulier",
	symbole: "\\rho_0",
	unite: "-",
	valeur: 1.5,
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "4.1.8(2)",
		page: "10"
	}],
	statut: "verifie",
	note: "Borne de la partie gauche de l'expression (4.4) de l'EN 1998-2."
};
const PSI_21 = {
	id: "psi_21",
	type: "table",
	etape: "modele",
	libelle: "Coefficient ψ2,1 des charges de trafic concomitantes au séisme (masses et combinaison)",
	symbole: "\\psi_{2,1}",
	unite: "-",
	cles: ["type de pont et de trafic"],
	valeurs: {
		cas_general: 0,
		routier_trafic_intense: .2,
		ferroviaire_trafic_intense: .3
	},
	references: [
		{
			source: "NF_EN_1998_2_NA",
			localisation: "4.1.2(4)P",
			page: "10"
		},
		{
			source: "NF_EN_1998_2",
			localisation: "4.1.2(4)P, valeurs recommandées",
			page: "42"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §3.3 et §4.2",
			page: "91, 95"
		}
	],
	statut: "via_guide",
	note: "L'AN retient les valeurs recommandées de l'EN ; leurs valeurs numériques sont reprises du guide. 0,2 vise les ponts routiers urbains à trafic intense (LM1)."
};
const ANNEXES_INFORMATIVES = {
	id: "annexes_informatives",
	type: "regle",
	etape: "modele",
	libelle: "Statut des annexes de l'EN 1998-2",
	enonce: "Les annexes A, B, C, D, E, F, H, JJ et K restent informatives. Pour l'annexe C (rigidité effective), la méthode simplifiée 1 est limitée à la zone effectivement fissurée.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "1.1.1(8), AN 2 à AN 10",
		page: "9, 12-13"
	}],
	statut: "verifie"
};
const VARIABILITE_SPATIALE = {
	id: "variabilite_spatiale_choix",
	type: "regle",
	etape: "modele",
	libelle: "Variabilité spatiale de l'action sismique",
	enonce: "Longueur de tablier, distance d'indépendance et coefficient d'opposition : valeurs recommandées de l'EN 1998-2.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "3.3(1)P, 3.3(6) notes 1 et 2",
		page: "9-10"
	}],
	statut: "verifie"
};
const FAIBLE_SISMICITE = {
	id: "faible_sismicite_methode_simplifiee",
	type: "regle",
	etape: "analyse",
	libelle: "Méthode simplifiée en faible sismicité",
	enonce: "Ponts de catégorie I et II dont la surface utile de brèche est inférieure à 150 m² et pour lesquels ag·S ≤ 0,15 g : méthode statique équivalente avec une accélération horizontale uniforme égale à ag·S, et dispositions constructives de ductilité limitée.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "2.3.7(1)",
		page: "9"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.2",
		page: "116"
	}],
	statut: "verifie",
	note: "L'AN d'avril 2013 a remplacé « 150 m² ou 0,15 g » (édition d'octobre 2007) par « 150 m² et 0,15 g » ; les deux conditions sont donc cumulatives (catégories I et II)."
};
const SECOND_ORDRE$1 = {
	id: "second_ordre_choix",
	type: "regle",
	etape: "analyse",
	libelle: "Effets du second ordre en analyse linéaire",
	enonce: "Méthode simplifiée recommandée par l'EN 1998-2.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "5.4(1)",
		page: "10"
	}],
	statut: "verifie"
};
const D_LIM_CULEES = {
	id: "d_lim_culees",
	type: "table",
	etape: "verif_culees",
	libelle: "Déplacement sismique de calcul maximal des culées liées rigidement au tablier (ponts-routes)",
	symbole: "d_{lim}",
	unite: "mm",
	cles: ["catégorie d'importance"],
	valeurs: {
		I: null,
		II: null,
		III: 50,
		IV: 50
	},
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "6.7.3(7)",
		page: "11"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 5 §4.3",
		page: "190"
	}],
	statut: "verifie",
	note: "null = aucune limitation. Catégorie IV : l'AN ne la cite pas et le guide (p. 190) lui attribue 50 mm ; choix du projet validé le 17/10/2026 : 50 mm pour les catégories III et IV. Ponts-rails, ponts-canaux : valeurs fixées par projet."
};
const LONGUEUR_ROTULE_PLASTIQUE = {
	id: "Lp_rotule_plastique",
	type: "formule",
	etape: "verif_piles",
	libelle: "Longueur des rotules plastiques des éléments en béton",
	latex: "L_p = 0{,}10\\,L + 0{,}015\\,f_{yk}\\,d_{bL}",
	variables: [
		{
			symbole: "L",
			description: "distance entre la section de rotule et la section de moment nul",
			unite: "m"
		},
		{
			symbole: "f_{yk}",
			description: "limite d'élasticité caractéristique des armatures longitudinales",
			unite: "MPa"
		},
		{
			symbole: "d_{bL}",
			description: "diamètre des armatures longitudinales",
			unite: "m"
		}
	],
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "2.3.5.3(1)",
		page: "9"
	}, {
		source: "NF_EN_1998_2",
		localisation: "annexe E, E.3.2(5), expression (E.19)",
		page: "126"
	}],
	statut: "verifie",
	note: "EN 1998-2:2005, E.3.2(5) : f_yk en MPa (valeur numérique), L et d_bL en m : pour f_yk = 500 MPa et d_bL = 0,025 m, 0,015 f_yk d_bL = 0,19 m."
};
const GAMMA_BD_OPTION = {
	id: "gamma_Bd_option",
	type: "regle",
	etape: "verif_piles",
	libelle: "γBd des éléments ductiles hors rotules plastiques",
	enonce: "Option 2 : 1 ≤ γBd = γBd1.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "5.6.3.3(1)P b)",
		page: "10"
	}],
	statut: "verifie"
};
const DUCTILITE_LIMITEE_FAIBLE = {
	id: "ductilite_limitee_faible_sismicite",
	type: "regle",
	etape: "verif_piles",
	libelle: "Vérifications simplifiées des ponts à ductilité limitée en faible sismicité",
	enonce: "Règles recommandées par l'EN 1998-2.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "6.5.1(1)P",
		page: "10"
	}],
	statut: "verifie"
};
const SPIRES_INTERDITES = {
	id: "spires_interdites",
	type: "regle",
	etape: "dispositions_constructives",
	libelle: "Type d'armatures de confinement",
	enonce: "Les spires hélicoïdales sont interdites dans les zones critiques.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "6.2.1.4(1)P",
		page: "10"
	}],
	statut: "verifie"
};
const ELASTOMERE_FONCTIONNALITE = {
	id: "elastomere_fonctionnalite",
	type: "regle",
	etape: "verif_appareils_appui",
	libelle: "Appareils en élastomère pouvant être détériorés",
	enonce: "Le pont doit garder une fonctionnalité immédiate pour les circulations d'urgence : la transmission des charges verticales entre tablier et appui doit être maintenue.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "6.6.2.3(3)",
		page: "10"
	}],
	statut: "verifie"
};
const ISOLATION_CHOIX = {
	id: "isolation_choix",
	type: "regle",
	etape: "verif_appareils_appui",
	libelle: "Ponts avec isolation sismique (hors V1)",
	enonce: "TD du spectre de calcul, γIS, δw, δb et coefficients λ : valeurs recommandées de l'EN 1998-2. γm = 1,00 pour les appareils d'appui en élastomère.",
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "7.4.1(1)P, 7.6.2(1)P, 7.6.2(5), 7.7.1(2), J.2(1)",
		page: "11-12"
	}],
	statut: "verifie"
};
const TEMPERATURE_MIN_ISOLATEUR = {
	id: "delta_T1_isolateur",
	type: "table",
	etape: "verif_appareils_appui",
	libelle: "ΔT1 pour la température minimale d'un isolateur, Tmin,b = T0 − ψ2(T0 − Tmin) + ΔT1 avec ψ2 = 0,50",
	symbole: "\\Delta T_1",
	unite: "°C",
	cles: ["matériau du tablier"],
	valeurs: {
		beton: 7.5,
		mixte: 5,
		acier: -2.5
	},
	references: [{
		source: "NF_EN_1998_2_NA",
		localisation: "J.1(2), tableau J.1 N",
		page: "11-12"
	}],
	statut: "verifie",
	note: "Tmin selon EN 1991-1-5 6.1.3.2 (probabilité annuelle de dépassement 0,02)."
};
const NATIONAUX = [
	CHAMP_APPLICATION,
	CATEGORIES_IMPORTANCE,
	EXEMPTION,
	FONDATIONS_DEUX_ZONES,
	REGLES_APPLICABLES,
	SEISME_ACCIDENTEL,
	GAMMA_I,
	AGR,
	PARAMETRE_SOL_S,
	SOL_ET_VERTICAL,
	PERIODES_HORIZONTALES,
	SPECTRE_VERTICAL,
	SOL_PAR_DEFAUT,
	RHO_0,
	PSI_21,
	ANNEXES_INFORMATIVES,
	VARIABILITE_SPATIALE,
	FAIBLE_SISMICITE,
	SECOND_ORDRE$1,
	D_LIM_CULEES,
	LONGUEUR_ROTULE_PLASTIQUE,
	GAMMA_BD_OPTION,
	DUCTILITE_LIMITEE_FAIBLE,
	SPIRES_INTERDITES,
	ELASTOMERE_FONCTIONNALITE,
	ISOLATION_CHOIX,
	TEMPERATURE_MIN_ISOLATEUR,
	{
		id: "magnitude_liquefaction",
		type: "table",
		etape: "verif_fondations",
		libelle: "Magnitude conventionnelle pour l'analyse de la liquéfaction (NF EN 1998-5 annexe B)",
		symbole: "M_s",
		unite: "-",
		cles: ["zone de sismicité"],
		valeurs: {
			3: 5.5,
			4: 6,
			5: 7.5
		},
		references: [{
			source: "ARRETE_2011",
			localisation: "art. 4 III"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "Introduction §2.2.3",
			page: "13"
		}],
		statut: "via_guide",
		note: "Analyse de la liquéfaction non requise en zones 1 et 2."
	}
];
//#endregion
//#region src/moteur/note.ts
const formats = /* @__PURE__ */ new Map();
/** Nombre au format français, avec un nombre maximal de décimales. */
function nombre(v, decimales = 3) {
	let f = formats.get(decimales);
	if (!f) {
		f = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimales });
		formats.set(decimales, f);
	}
	return f.format(v);
}
/** Nombre au format LaTeX (virgule décimale, espaces fines pour les milliers). */
function tex(v, decimales = 3) {
	return nombre(v, decimales).replace(",", "{,}").replace(/ | /g, "\\,");
}
//#endregion
//#region src/moteur/spectres.ts
/** Valeur du spectre (m/s²) pour la période T (s). Au-delà de 4 s, la branche en 1/T² est prolongée. */
function valeur(f, T) {
	if (!(T >= 0)) return NaN;
	let k;
	if (T <= f.TB) k = f.plateauOrigine ? f.plateau : f.depart + T / f.TB * (f.plateau - f.depart);
	else if (T <= f.TC) k = f.plateau;
	else if (T <= f.TD) k = f.plateau * f.TC / T;
	else k = f.plateau * f.TC * f.TD / (T * T);
	const v = f.amplitude * k;
	return f.plancher !== void 0 && T >= f.TC ? Math.max(v, f.plancher) : v;
}
/** Spectre élastique en déplacement SDe(T) = Se(T)·(T/2π)², en m (EN 1998-1 éq. 3.7). */
const deplacement = (f, T) => valeur(f, T) * (T / (2 * Math.PI)) ** 2;
/** Échantillonnage pour le tracé, en incluant exactement les périodes de coin. */
function echantillonner(f, Tmax = 4, pas = .01, fn = valeur) {
	const Ts = /* @__PURE__ */ new Set();
	for (let T = 0; T <= Tmax + 1e-9; T += pas) Ts.add(Math.round(T * 1e6) / 1e6);
	for (const T of [
		f.TB,
		f.TC,
		f.TD
	]) if (T <= Tmax) Ts.add(T);
	if (f.plancher !== void 0) {
		const k = f.amplitude * f.plateau;
		const T1 = k * f.TC / f.plancher;
		const T2 = Math.sqrt(k * f.TC * f.TD / f.plancher);
		for (const T of [T1, T2]) if (T > f.TC && T <= Tmax) Ts.add(T);
	}
	return [...Ts].sort((a, b) => a - b).map((T) => [T, fn(f, T)]);
}
//#endregion
//#region src/moteur/action.ts
function actionSismique(p) {
	const { site, comportement } = p;
	const G = p.options.g;
	const soumis = site.zone !== 1 && site.categorie !== "I";
	const zoneCalcul = site.zone === 1 ? 2 : site.zone;
	const categorie = site.categorie === "I" ? "II" : site.categorie;
	const groupe = groupeDeZone(zoneCalcul);
	const gammaI = GAMMA_I.valeurs[categorie];
	const agr = AGR.valeurs[zoneCalcul];
	const ag = gammaI * agr;
	const S = PARAMETRE_SOL_S.valeurs[groupe][site.classeSol];
	const { TB, TC, TD } = PERIODES_HORIZONTALES.valeurs[groupe][site.classeSol];
	const ST = site.ST;
	const xi = comportement.amortissement;
	const eta = Math.max(Math.sqrt(10 / (5 + xi)), .55);
	const dg = .025 * ag * S * ST * TC * TD;
	const { TE, TF } = TE_TF.valeurs[site.classeSol];
	const vertical = SPECTRE_VERTICAL.valeurs[groupe];
	const avg = vertical.rapport * ag;
	const q = {
		longitudinal: comportement.qLongitudinal,
		transversal: comportement.qTransversal,
		vertical: 1
	};
	const beta = BETA.valeur;
	const plateauOrigine = comportement.plateauOrigine;
	const elastiqueH = {
		amplitude: ag * S * ST,
		TB,
		TC,
		TD,
		plateau: 2.5 * eta,
		depart: 1,
		plateauOrigine
	};
	const calcul = (qd) => ({
		amplitude: ag * S * ST,
		TB,
		TC,
		TD,
		plateau: 2.5 / qd,
		depart: 2 / 3,
		plancher: beta * ag,
		plateauOrigine
	});
	const elastiqueV = {
		amplitude: avg * ST,
		TB: vertical.TB,
		TC: vertical.TC,
		TD: vertical.TD,
		plateau: 3 * eta,
		depart: 1,
		plateauOrigine
	};
	const spectres = {
		elastiqueH,
		calculLong: calcul(q.longitudinal),
		calculTrans: calcul(q.transversal),
		elastiqueV
	};
	const plateaux = {
		Se: valeur(elastiqueH, TB),
		SdLong: valeur(spectres.calculLong, TB),
		SdTrans: valeur(spectres.calculTrans, TB),
		Sve: valeur(elastiqueV, vertical.TB)
	};
	const d = derives(p);
	const surfaceBreche = d.longueur * p.tablier.largeur;
	const agSsurG = ag * S / G;
	const categoriePetite = site.categorie === "I" || site.categorie === "II";
	const faibleSismicite = categoriePetite && surfaceBreche < 150 && agSsurG <= .15 ? {
		applicable: true,
		motif: `Catégorie ${site.categorie}, surface de brèche ${nombre(surfaceBreche, 0)} m² < 150 m² et ag·S = ${nombre(agSsurG, 3)} g ≤ 0,15 g : méthode statique équivalente admise avec une accélération uniforme ag·S.`
	} : {
		applicable: false,
		motif: categoriePetite ? `${surfaceBreche >= 150 ? `Surface de brèche ${nombre(surfaceBreche, 0)} m² ≥ 150 m²` : ""}${surfaceBreche >= 150 && agSsurG > .15 ? " et " : ""}${agSsurG > .15 ? `ag·S = ${nombre(agSsurG, 3)} g > 0,15 g` : ""} : méthode simplifiée non admise (AN avril 2013 : conditions cumulatives).` : `Catégorie ${site.categorie} : méthode simplifiée réservée aux catégories I et II.`
	};
	const lignesClassification = [{
		id: "soumission",
		titre: "Application des règles parasismiques",
		resultat: {
			symbole: `\\text{Zone ${site.zone}, catégorie ${site.categorie}}`,
			valeur: soumis ? "soumis" : "non soumis"
		},
		references: ["exemption", "champ_application"],
		commentaire: soumis ? "Pont nouveau définitif de catégorie II à IV en zone 2 à 5 : règles de l'article 4 applicables." : "Pont non soumis aux règles parasismiques ; le calcul est mené à titre indicatif avec les paramètres de la zone 2 et de la catégorie II.",
		niveau: soumis ? void 0 : "alerte"
	}, {
		id: "gamma_I",
		titre: "Coefficient d'importance",
		resultat: {
			symbole: "\\gamma_I",
			valeur: gammaI,
			decimales: 2
		},
		references: ["gamma_I", "categories_importance"],
		commentaire: `Catégorie d'importance ${categorie}.`
	}];
	const lignesAcceleration = [
		{
			id: "agr",
			titre: "Accélération de référence au rocher",
			resultat: {
				symbole: "a_{gR}",
				valeur: agr,
				unite: "m/s²",
				decimales: 2
			},
			references: ["agr"],
			commentaire: `Zone de sismicité ${zoneCalcul}.`
		},
		{
			id: "ag",
			titre: "Accélération horizontale de calcul au rocher",
			formule: "a_g = \\gamma_I \\cdot a_{gR}",
			application: `${tex(gammaI, 2)} \\times ${tex(agr, 2)}`,
			resultat: {
				symbole: "a_g",
				valeur: ag,
				unite: "m/s²",
				decimales: 3
			},
			references: ["ag"],
			commentaire: `Soit ${nombre(ag / G, 3)} g.`
		},
		{
			id: "avg",
			titre: "Accélération verticale de calcul",
			formule: `a_{vg} = ${tex(vertical.rapport, 2)}\\,a_g`,
			application: `${tex(vertical.rapport, 2)} \\times ${tex(ag, 3)}`,
			resultat: {
				symbole: "a_{vg}",
				valeur: avg,
				unite: "m/s²",
				decimales: 3
			},
			references: ["avg", "spectre_vertical"]
		}
	];
	const lignesSite = [
		{
			id: "sol",
			titre: "Paramètres du spectre horizontal",
			resultat: {
				symbole: `\\text{sol } ${site.classeSol}`,
				valeur: `S = ${nombre(S, 2)} ; TB = ${nombre(TB, 2)} s ; TC = ${nombre(TC, 2)} s ; TD = ${nombre(TD, 2)} s`
			},
			references: [
				"S",
				"periodes_horizontales",
				"classes_sol"
			],
			commentaire: groupe === "zone_5" ? "Valeurs de la zone 5." : "Valeurs des zones 2 à 4."
		},
		{
			id: "ST",
			titre: "Coefficient d'amplification topographique",
			resultat: {
				symbole: "S_T",
				valeur: ST,
				decimales: 2
			},
			references: ["ST"]
		},
		{
			id: "faible_sismicite",
			titre: "Méthode simplifiée des zones à sismicité faible",
			formule: "\\dfrac{a_g\\,S}{g} \\le 0{,}15 \\ \\text{et}\\ L \\cdot B < 150\\ \\text{m}^2",
			application: `\\dfrac{${tex(ag, 3)} \\times ${tex(S, 2)}}{${tex(G, 2)}} = ${tex(agSsurG, 3)}, \\qquad ${tex(d.longueur, 2)} \\times ${tex(p.tablier.largeur, 2)} = ${tex(surfaceBreche, 0)}\\ \\text{m}^2`,
			resultat: {
				symbole: "\\text{méthode simplifiée}",
				valeur: faibleSismicite.applicable ? "admise" : "non admise"
			},
			references: ["faible_sismicite_methode_simplifiee"],
			commentaire: faibleSismicite.motif,
			niveau: "info"
		}
	];
	const lignesAmortissement = [{
		id: "eta",
		titre: "Correction de l'amortissement",
		formule: "\\eta = \\sqrt{\\dfrac{10}{5 + \\xi}} \\ge 0{,}55",
		application: `\\sqrt{\\dfrac{10}{5 + ${tex(xi, 1)}}}`,
		resultat: {
			symbole: "\\eta",
			valeur: eta,
			decimales: 3
		},
		references: ["eta", "amortissement_materiaux"],
		commentaire: `Amortissement retenu ξ = ${nombre(xi, 1)} %.`
	}];
	const commentairePlateau = plateauOrigine ? "Plateau prolongé jusqu'à T = 0, comme le recommande le guide Cerema." : "Forme de l'EN 1998-1 : branche croissante de 0 à TB.";
	const lignesHorizontal = [
		{
			id: "Se_plateau",
			titre: "Plateau du spectre élastique horizontal",
			formule: "S_e(T_B \\le T \\le T_C) = a_g\\,S\\,S_T \\cdot 2{,}5\\,\\eta",
			application: `${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times 2{,}5 \\times ${tex(eta, 3)}`,
			resultat: {
				symbole: "S_e",
				valeur: plateaux.Se,
				unite: "m/s²",
				decimales: 3
			},
			references: ["Se", "plateau_origine"],
			commentaire: commentairePlateau
		},
		{
			id: "Se_0",
			titre: "Valeur à période nulle",
			formule: plateauOrigine ? "S_e(0) = S_e(T_B)" : "S_e(0) = a_g\\,S\\,S_T",
			resultat: {
				symbole: "S_e(0)",
				valeur: valeur(elastiqueH, 0),
				unite: "m/s²",
				decimales: 3
			},
			references: plateauOrigine ? ["plateau_origine"] : ["Se"]
		},
		{
			id: "dg",
			titre: "Déplacement de calcul du sol",
			formule: "d_g = 0{,}025\\,a_g\\,S\\,S_T\\,T_C\\,T_D",
			application: `0{,}025 \\times ${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times ${tex(TC, 2)} \\times ${tex(TD, 2)}`,
			resultat: {
				symbole: "d_g",
				valeur: dg,
				unite: "m",
				decimales: 4
			},
			references: ["dg"]
		},
		{
			id: "SDe",
			titre: "Spectre élastique en déplacement",
			formule: "S_{De}(T) = S_e(T)\\left(\\dfrac{T}{2\\pi}\\right)^2 \\quad (T \\le 4\\ \\text{s})",
			resultat: {
				symbole: "T_E,\\ T_F",
				valeur: `${nombre(TE, 1)} s ; ${nombre(TF, 1)} s`
			},
			references: [
				"SDe",
				"TE_TF",
				"SDe_longues_periodes"
			],
			commentaire: "Au-delà de 4 s : annexe A de l'EN 1998-1 (informative)."
		}
	];
	const ligneCalcul = (direction, qd, plateau) => ({
		id: `Sd_${direction}`,
		titre: `Plateau du spectre de calcul, direction ${direction}e`,
		formule: "S_d(T_B \\le T \\le T_C) = a_g\\,S\\,S_T\\,\\dfrac{2{,}5}{q}",
		application: `${tex(ag, 3)} \\times ${tex(S, 2)} \\times ${tex(ST, 2)} \\times \\dfrac{2{,}5}{${tex(qd, 2)}}`,
		resultat: {
			symbole: `S_{d,${direction === "longitudinal" ? "x" : "y"}}`,
			valeur: plateau,
			unite: "m/s²",
			decimales: 3
		},
		references: [
			"Sd",
			"q_max",
			"plateau_origine"
		],
		commentaire: qd === 1 ? "q = 1 : le spectre de calcul se confond avec le spectre élastique (η = 1)." : qd <= 1.5 ? `q = ${nombre(qd, 2)} : conception à ductilité limitée.` : `q = ${nombre(qd, 2)} > 1,5 : conception ductile, hors du périmètre de la V1.`,
		niveau: qd > 1.5 ? "alerte" : void 0
	});
	const lignesCalcul = [
		ligneCalcul("longitudinal", q.longitudinal, plateaux.SdLong),
		ligneCalcul("transversal", q.transversal, plateaux.SdTrans),
		{
			id: "plancher",
			titre: "Limite inférieure du spectre de calcul",
			formule: "S_d(T \\ge T_C) \\ge \\beta\\,a_g",
			application: `${tex(beta, 2)} \\times ${tex(ag, 3)}`,
			resultat: {
				symbole: "\\beta\\,a_g",
				valeur: beta * ag,
				unite: "m/s²",
				decimales: 3
			},
			references: ["beta", "Sd"]
		}
	];
	const lignesVertical = [
		{
			id: "vertical_parametres",
			titre: "Paramètres du spectre vertical",
			resultat: {
				symbole: "T_B,\\ T_C,\\ T_D",
				valeur: `${nombre(vertical.TB, 2)} s ; ${nombre(vertical.TC, 2)} s ; ${nombre(vertical.TD, 2)} s`
			},
			references: ["spectre_vertical", "sol_composante_verticale"],
			commentaire: "Indépendants de la classe de sol."
		},
		{
			id: "q_vertical",
			titre: "Coefficient de comportement vertical",
			resultat: {
				symbole: "q_z",
				valeur: 1,
				decimales: 1
			},
			references: ["q_vertical"]
		},
		{
			id: "Sve_plateau",
			titre: "Plateau du spectre élastique vertical",
			formule: "S_{ve}(T_B \\le T \\le T_C) = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
			application: `${tex(avg, 3)} \\times ${tex(ST, 2)} \\times 3{,}0 \\times ${tex(eta, 3)}`,
			resultat: {
				symbole: "S_{ve}",
				valeur: plateaux.Sve,
				unite: "m/s²",
				decimales: 3
			},
			references: ["Sve", "plateau_origine"],
			commentaire: "À considérer au moins pour les appareils d'appui et les attelages ; pour les tabliers précontraints ; et, en zones 4 et 5, pour les piles sous conditions."
		}
	];
	return {
		soumis,
		zoneCalcul,
		gammaI,
		agr,
		ag,
		S,
		ST,
		TB,
		TC,
		TD,
		xi,
		eta,
		dg,
		TE,
		TF,
		avg,
		vertical,
		q,
		beta,
		faibleSismicite,
		spectres,
		plateaux,
		note: [
			{
				id: "classification",
				titre: "Classification",
				lignes: lignesClassification
			},
			{
				id: "accelerations",
				titre: "Accélérations de calcul",
				lignes: lignesAcceleration
			},
			{
				id: "site",
				titre: "Sol et site",
				lignes: lignesSite
			},
			{
				id: "amortissement",
				titre: "Amortissement",
				lignes: lignesAmortissement
			},
			{
				id: "horizontal",
				titre: "Spectre élastique horizontal",
				lignes: lignesHorizontal
			},
			{
				id: "calcul",
				titre: "Spectres de calcul",
				lignes: lignesCalcul
			},
			{
				id: "vertical",
				titre: "Spectre vertical",
				lignes: lignesVertical
			}
		]
	};
}
//#endregion
//#region src/moteur/modele.ts
const inverse = (k) => k === Infinity ? 0 : k === 0 ? Infinity : 1 / k;
const serie = (...ks) => inverse(ks.reduce((s, k) => s + inverse(k), 0));
const fmtK = (k, d = 2) => k === Infinity ? "\\infty" : tex(k, d);
const txtK = (k) => k === Infinity ? "rigide" : `${nombre(k, 2)} MN/m`;
function inerties(appui) {
	const { forme, long, trans } = appui.futs;
	const k = appui.facteurInertie && appui.facteurInertie > 0 ? appui.facteurInertie : 1;
	if (forme === "circulaire") {
		const I = k * Math.PI * long ** 4 / 64;
		return {
			Ix: I,
			Iy: I,
			aire: Math.PI * long ** 2 / 4
		};
	}
	return {
		Ix: k * trans * long ** 3 / 12,
		Iy: k * long * trans ** 3 / 12,
		aire: long * trans
	};
}
function modele(p) {
	const d = derives(p);
	const fck = p.materiaux.beton.fck;
	const Ecm = 22 * ((fck + 8) / 10) ** .3 * 1e3;
	const E = Ecm;
	const ligneEcm = {
		id: "Ecm",
		titre: "Module d'élasticité instantané du béton",
		formule: "E_{cm} = 22\\left(\\dfrac{f_{ck} + 8}{10}\\right)^{0{,}3}",
		application: `22\\left(\\dfrac{${tex(fck, 0)} + 8}{10}\\right)^{0{,}3} \\times 1000`,
		resultat: {
			symbole: "E_{cm}",
			valeur: Ecm,
			unite: "MPa",
			decimales: 0
		},
		references: ["Ecm"]
	};
	const psi21 = PSI_21.valeurs[p.site.trafic];
	const masseTablier = d.masseTablier;
	const masseTrafic = psi21 * p.tablier.chargeTrafic * d.longueur / p.options.g;
	const piles = p.appuis.filter((a) => a.type === "pile").map((pile) => {
		const masseFuts = pile.futs.nombre * inerties(pile).aire * pile.futs.hauteur * p.materiaux.beton.masseVolumique;
		return {
			id: pile.id,
			masseFuts,
			ajoutTablier: pile.appareils.type === "fixe" ? masseFuts / 2 : 0
		};
	});
	const ajoutPiles = piles.reduce((s, x) => s + x.ajoutTablier, 0);
	const M = masseTablier + masseTrafic + ajoutPiles;
	const lignesMasses = [{
		id: "masse_tablier",
		titre: "Masse du tablier",
		formule: "M_{tablier} = \\dfrac{\\rho\\,A\\,g + g_{sup}}{g}\\,L",
		application: `\\dfrac{${tex(p.materiaux.beton.masseVolumique, 2)} \\times ${tex(p.tablier.aire, 3)} \\times ${tex(p.options.g, 2)} + ${tex(p.tablier.superstructures, 2)}}{${tex(p.options.g, 2)}} \\times ${tex(d.longueur, 3)}`,
		resultat: {
			symbole: "M_{tablier}",
			valeur: masseTablier,
			unite: "t",
			decimales: 1
		},
		references: ["masses_sismiques"],
		commentaire: `Masse linéique ${nombre(d.masseLineique, 3)} t/m, comptée entre les axes d'appui des culées.`
	}, {
		id: "masse_trafic",
		titre: "Part des charges de trafic",
		formule: "M_{trafic} = \\psi_{2,1}\\,\\dfrac{q_{trafic}\\,L}{g}",
		application: `${tex(psi21, 1)} \\times \\dfrac{${tex(p.tablier.chargeTrafic, 1)} \\times ${tex(d.longueur, 3)}}{${tex(p.options.g, 2)}}`,
		resultat: {
			symbole: "M_{trafic}",
			valeur: masseTrafic,
			unite: "t",
			decimales: 1
		},
		references: ["psi_21"]
	}];
	if (ajoutPiles > 0) lignesMasses.push({
		id: "masse_piles",
		titre: "Demi-masse des piles sous appareils fixes",
		resultat: {
			symbole: "\\sum \\tfrac{1}{2} M_{fûts}",
			valeur: ajoutPiles,
			unite: "t",
			decimales: 1
		},
		references: ["masses_sismiques"],
		commentaire: piles.filter((x) => x.ajoutTablier > 0).map((x) => `${x.id} : ${nombre(x.ajoutTablier, 1)} t`).join(" ; ")
	});
	lignesMasses.push({
		id: "masse_sismique",
		titre: "Masse sismique",
		formule: "M = M_{tablier} + M_{trafic}" + (ajoutPiles > 0 ? " + \\sum \\tfrac{1}{2} M_{fûts}" : ""),
		resultat: {
			symbole: "M",
			valeur: M,
			unite: "t",
			decimales: 1
		},
		references: ["masses_sismiques"],
		commentaire: `Masse propre des fûts (traitée séparément pour les piles sur appareils souples) : ${piles.map((x) => `${x.id} ${nombre(x.masseFuts, 1)} t`).join(", ") || "aucune pile"}.`
	});
	const elastomere = p.appuis.find((a) => a.appareils.type === "elastomere")?.appareils;
	let elastomeres = null;
	const lignesG = [];
	if (elastomere && elastomere.type === "elastomere") {
		const Gg = elastomere.Gg;
		const Gb = 1.1 * Gg;
		const materiau = p.tablier.type === "mixte" ? "mixte" : "beton";
		const dT1 = TEMPERATURE_MIN_ISOLATEUR.valeurs[materiau];
		const { T0, Tmin, lambdaMaxF1, lambdaMaxF2, psiFi } = p.elastomeres;
		const Tminb = T0 - .5 * (T0 - Tmin) + dT1;
		const lambdaU1 = 1 + (lambdaMaxF1 - 1) * psiFi;
		const lambdaU2 = 1 + (lambdaMaxF2 - 1) * psiFi;
		const regle = Tminb >= 0 ? "1,2 Gb" : "λ";
		const GbMax = regle === "1,2 Gb" ? 1.2 * Gb : lambdaU1 * lambdaU2 * Gb;
		elastomeres = {
			Gg,
			Gb,
			Tminb,
			lambdaU1,
			lambdaU2,
			GbMax,
			regle,
			G: {
				lbdp: Gb,
				ubdp: GbMax
			}
		};
		lignesG.push({
			id: "Gb",
			titre: "Module de cisaillement nominal",
			formule: "G_b = 1{,}1\\,G_g",
			application: `1{,}1 \\times ${tex(Gg, 2)}`,
			resultat: {
				symbole: "G_b",
				valeur: Gb,
				unite: "MPa",
				decimales: 3
			},
			references: ["module_G_elastomere"],
			commentaire: "Propriétés limites inférieures (LBDP) : Gb,min = Gb."
		}, {
			id: "Tminb",
			titre: "Température minimale des appareils",
			formule: "T_{min,b} = T_0 - \\psi_2\\,(T_0 - T_{min}) + \\Delta T_1",
			application: `${tex(T0, 1)} - 0{,}5 \\times (${tex(T0, 1)} - (${tex(Tmin, 1)})) + ${tex(dT1, 1)}`,
			resultat: {
				symbole: "T_{min,b}",
				valeur: Tminb,
				unite: "°C",
				decimales: 2
			},
			references: ["Tmin_b", "delta_T1_isolateur"],
			commentaire: `Tablier ${materiau === "mixte" ? "mixte" : "en béton"} : ΔT1 = ${nombre(dT1, 1)} °C.`
		});
		if (regle === "λ") lignesG.push({
			id: "lambdaU",
			titre: "Facteurs de modification (vieillissement et température)",
			formule: "\\lambda_{U,fi} = 1 + (\\lambda_{max,fi} - 1)\\,\\psi_{fi}",
			application: `1 + (${tex(lambdaMaxF1, 2)} - 1) \\times ${tex(psiFi, 2)}`,
			resultat: {
				symbole: "\\lambda_{U,f1}",
				valeur: lambdaU1,
				decimales: 4
			},
			references: ["lambda_U"],
			commentaire: `λU,f2 = ${nombre(lambdaU2, 4)} (λmax,f2 = ${nombre(lambdaMaxF2, 2)}).`
		}, {
			id: "GbMax",
			titre: "Module en propriétés limites supérieures (UBDP)",
			formule: "G_{b,max} = \\lambda_{U,f1}\\,\\lambda_{U,f2}\\,G_b",
			application: `${tex(lambdaU1, 4)} \\times ${tex(lambdaU2, 4)} \\times ${tex(Gb, 3)}`,
			resultat: {
				symbole: "G_{b,max}",
				valeur: GbMax,
				unite: "MPa",
				decimales: 3
			},
			references: ["lambda_U", "bornes_G_elastomere"],
			commentaire: "Tmin,b < 0 °C : facteurs λ des tableaux JJ.1 et JJ.2."
		});
		else lignesG.push({
			id: "GbMax",
			titre: "Module en propriétés limites supérieures (UBDP)",
			formule: "G_{b,max} = 1{,}2\\,G_b",
			application: `1{,}2 \\times ${tex(Gb, 3)}`,
			resultat: {
				symbole: "G_{b,max}",
				valeur: GbMax,
				unite: "MPa",
				decimales: 3
			},
			references: ["bornes_G_elastomere"],
			commentaire: "Tmin,b ≥ 0 °C."
		});
	}
	const lignes = {
		x: [],
		y: []
	};
	const raideurAppui = (appui, dir) => {
		const nomDir = dir === "x" ? "longitudinal" : "transversal";
		let kSupport;
		let descSupport;
		if (appui.type === "pile") {
			const { Ix, Iy } = inerties(appui);
			const I = dir === "x" ? Ix : Iy;
			const { nombre: n, hauteur: h } = appui.futs;
			kSupport = n * 3 * E * I / h ** 3;
			descSupport = `${n} fût(s) en console`;
			lignes[dir].push({
				id: `${appui.id}_${dir}_futs`,
				titre: `${appui.id} — raideur des fûts (${nomDir})`,
				formule: "k_{fûts} = n\\,\\dfrac{3\\,E\\,I}{h^3}",
				application: `${n} \\times \\dfrac{3 \\times ${tex(E, 0)} \\times ${tex(I, 5)}}{${tex(h, 2)}^3}`,
				resultat: {
					symbole: "k_{fûts}",
					valeur: kSupport,
					unite: "MN/m",
					decimales: 2
				},
				references: [
					"raideur_fut",
					"inerties_piles",
					"Ecm"
				],
				commentaire: "Fûts encastrés en pied (fondation rigide), libres en rotation en tête."
			});
		} else {
			const c = appui;
			const rigide = dir === "x" ? c.rigide.longitudinal : c.rigide.transversal;
			const { nombre: n, cote, hauteur: h } = c.poteaux;
			const I = cote ** 4 / 12;
			if (rigide) {
				kSupport = Infinity;
				descSupport = "culée supposée rigide";
				lignes[dir].push({
					id: `${appui.id}_${dir}_culee`,
					titre: `${appui.id} — raideur propre de la culée (${nomDir})`,
					resultat: {
						symbole: "k_{culée}",
						valeur: "infinie (culée supposée rigide)"
					},
					references: ["culee_rigide"]
				});
			} else {
				const coef = dir === "y" ? 12 : 3;
				kSupport = n * coef * E * I / h ** 3;
				descSupport = dir === "y" ? `${n} poteau(x) encastrés en pied et en tête` : `${n} poteau(x) en console`;
				lignes[dir].push({
					id: `${appui.id}_${dir}_culee`,
					titre: `${appui.id} — raideur des poteaux (${nomDir})`,
					formule: `k_{culée} = n\\,\\dfrac{${coef}\\,E\\,I}{h^3}`,
					application: `${n} \\times \\dfrac{${coef} \\times ${tex(E, 0)} \\times ${tex(I, 5)}}{${tex(h, 2)}^3}`,
					resultat: {
						symbole: "k_{culée}",
						valeur: kSupport,
						unite: "MN/m",
						decimales: 2
					},
					references: [
						"raideur_fut",
						"culee_rigide",
						"Ecm"
					],
					commentaire: dir === "y" ? "Poteaux bloqués en rotation par le sommier et la longrine." : "Poteaux en console."
				});
			}
		}
		const a = appui.appareils;
		const bloque = dir === "x" ? appui.butees.longitudinales : appui.butees.transversales;
		let kApp;
		let descApp;
		if (bloque || a.type === "fixe") {
			kApp = {
				lbdp: Infinity,
				ubdp: Infinity
			};
			descApp = bloque ? "butées de blocage" : "appareils fixes";
			lignes[dir].push({
				id: `${appui.id}_${dir}_appareils`,
				titre: `${appui.id} — liaison tablier-appui (${nomDir})`,
				resultat: {
					symbole: "k_{appareils}",
					valeur: `infinie (${descApp})`
				},
				references: bloque ? ["butees"] : ["appareils_fixes"]
			});
		} else if (a.type === "glissant") {
			kApp = {
				lbdp: 0,
				ubdp: 0
			};
			descApp = "appareils glissants (frottement négligé)";
			lignes[dir].push({
				id: `${appui.id}_${dir}_appareils`,
				titre: `${appui.id} — liaison tablier-appui (${nomDir})`,
				resultat: {
					symbole: "k_{appareils}",
					valeur: "nulle (appareils glissants, frottement négligé)"
				},
				references: ["masses_sismiques"]
			});
		} else if (a.type === "elastomere") {
			const Tq = epaisseurElastomere(a) ?? 0;
			const G = elastomeres?.G ?? {
				lbdp: 1.1 * a.Gg,
				ubdp: 1.1 * a.Gg
			};
			kApp = {
				lbdp: a.nombre * G.lbdp * a.a * a.b / Tq,
				ubdp: a.nombre * G.ubdp * a.a * a.b / Tq
			};
			descApp = `${a.nombre} élastomère(s)`;
			lignes[dir].push({
				id: `${appui.id}_${dir}_appareils`,
				titre: `${appui.id} — raideur des appareils en élastomère (${nomDir})`,
				formule: "k_{appareils} = n\\,\\dfrac{G\\,a\\,b}{T_q}",
				application: `${a.nombre} \\times \\dfrac{${tex(G.lbdp, 3)} \\times ${tex(a.a, 3)} \\times ${tex(a.b, 3)}}{${tex(Tq, 3)}}`,
				resultat: {
					symbole: "k_{appareils}^{LBDP}",
					valeur: kApp.lbdp,
					unite: "MN/m",
					decimales: 3
				},
				references: ["raideur_elastomere", "module_G_elastomere"],
				commentaire: `UBDP (G = ${nombre(G.ubdp, 3)} MPa) : ${nombre(kApp.ubdp, 3)} MN/m.`
			});
		} else {
			kApp = {
				lbdp: Infinity,
				ubdp: Infinity
			};
			descApp = "liaison rigide";
		}
		const kTotal = {
			lbdp: serie(kSupport, kApp.lbdp),
			ubdp: serie(kSupport, kApp.ubdp)
		};
		lignes[dir].push({
			id: `${appui.id}_${dir}_total`,
			titre: `${appui.id} — raideur de l'appui (${nomDir})`,
			formule: "k_{appui} = \\left(\\dfrac{1}{k_{support}} + \\dfrac{1}{k_{appareils}}\\right)^{-1}",
			application: `\\left(\\dfrac{1}{${fmtK(kSupport)}} + \\dfrac{1}{${fmtK(kApp.lbdp)}}\\right)^{-1}`,
			resultat: {
				symbole: "k_{appui}^{LBDP}",
				valeur: kTotal.lbdp === Infinity ? "rigide" : kTotal.lbdp,
				unite: kTotal.lbdp === Infinity ? void 0 : "MN/m",
				decimales: 3
			},
			references: ["raideur_ligne_appui"],
			commentaire: `UBDP : ${txtK(kTotal.ubdp)}.`
		});
		return {
			id: appui.id,
			type: appui.type,
			kSupport,
			kAppareils: kApp,
			kTotal,
			part: {
				lbdp: 0,
				ubdp: 0
			},
			description: `${descSupport} ; ${descApp}`
		};
	};
	const directions = {};
	for (const dir of ["x", "y"]) {
		const appuis = p.appuis.map((a) => raideurAppui(a, dir));
		const K = {
			lbdp: appuis.reduce((s, a) => s + a.kTotal.lbdp, 0),
			ubdp: appuis.reduce((s, a) => s + a.kTotal.ubdp, 0)
		};
		for (const a of appuis) for (const b of ["lbdp", "ubdp"]) a.part[b] = K[b] === Infinity ? a.kTotal[b] === Infinity ? 1 / appuis.filter((x) => x.kTotal[b] === Infinity).length : 0 : K[b] > 0 ? a.kTotal[b] / K[b] : 0;
		lignes[dir].push({
			id: `K_${dir}`,
			titre: `Raideur totale de l'ouvrage (${dir === "x" ? "longitudinal" : "transversal"})`,
			formule: "K = \\sum_i k_{appui,i}",
			application: appuis.map((a) => fmtK(a.kTotal.lbdp)).join(" + "),
			resultat: {
				symbole: "K^{LBDP}",
				valeur: K.lbdp === Infinity ? "rigide (au moins un appui bloqué sur un support rigide)" : K.lbdp,
				unite: K.lbdp === Infinity ? void 0 : "MN/m",
				decimales: 2
			},
			references: ["raideur_ligne_appui", "tablier_rigide"],
			commentaire: `UBDP : ${txtK(K.ubdp)}.`,
			niveau: K.lbdp === Infinity ? "info" : void 0
		});
		directions[dir] = {
			appuis,
			K
		};
	}
	const xiBeton = .05;
	const energies = directions.x.appuis.filter((a) => a.kTotal.lbdp > 0 && a.kTotal.lbdp < Infinity).flatMap((a) => {
		const F = a.kTotal.lbdp;
		const parts = [];
		if (a.kSupport < Infinity) parts.push({
			xi: xiBeton,
			E: F * F / (2 * a.kSupport)
		});
		if (a.kAppareils.lbdp < Infinity && a.kAppareils.lbdp > 0) parts.push({
			xi: .05,
			E: F * F / (2 * a.kAppareils.lbdp)
		});
		return parts;
	});
	const sommeE = energies.reduce((s, e) => s + e.E, 0);
	const xi = sommeE > 0 ? 100 * energies.reduce((s, e) => s + e.xi * e.E, 0) / sommeE : 5;
	const ecartSaisie = p.comportement.amortissement - xi;
	const lignesAmortissement = [{
		id: "xi",
		titre: "Amortissement global (direction longitudinale)",
		formule: "\\xi = \\dfrac{\\sum_k \\xi_k\\,E_k}{\\sum_k E_k}",
		resultat: {
			symbole: "\\xi",
			valeur: xi,
			unite: "%",
			decimales: 1
		},
		references: ["amortissement_global", "amortissement_materiaux"],
		commentaire: Math.abs(ecartSaisie) > .5 ? `L'amortissement saisi dans l'action sismique (${nombre(p.comportement.amortissement, 1)} %) diffère de cette valeur.` : "Béton armé et élastomère à faible amortissement : 5 %. Cohérent avec la valeur saisie dans l'action sismique.",
		niveau: Math.abs(ecartSaisie) > .5 ? "alerte" : void 0
	}];
	const note = [{
		id: "materiaux",
		titre: "Matériau",
		lignes: [ligneEcm]
	}, {
		id: "masses",
		titre: "Masses",
		lignes: lignesMasses
	}];
	if (lignesG.length) note.push({
		id: "elastomeres",
		titre: "Module des élastomères",
		lignes: lignesG
	});
	note.push({
		id: "raideurs_x",
		titre: "Raideurs longitudinales",
		lignes: lignes.x
	}, {
		id: "raideurs_y",
		titre: "Raideurs transversales",
		lignes: lignes.y
	}, {
		id: "amortissement",
		titre: "Amortissement",
		lignes: lignesAmortissement
	});
	return {
		Ecm,
		masses: {
			masseLineique: d.masseLineique,
			tablier: masseTablier,
			trafic: masseTrafic,
			psi21,
			M,
			piles
		},
		elastomeres,
		directions,
		amortissement: {
			xi,
			ecartSaisie
		},
		note
	};
}
//#endregion
//#region src/referentiel/modele.ts
const MASSES = {
	id: "masses_sismiques",
	type: "regle",
	etape: "modele",
	libelle: "Masses à prendre en compte",
	enonce: "Masses permanentes avec leur valeur moyenne, mobilisées dans toutes les directions, augmentées de ψ2,1 fois les charges de trafic (pont chargé sur toute sa longueur, valeurs non pondérées). Tablier sur appareils glissants ou en élastomère : masse des piles traitée séparément (inertie propre). Tablier bloqué sur la pile : ajouter au tablier la moitié supérieure de la pile. Masses en kg ou t, efforts en N ou kN (g = 9,81 m/s²).",
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.1.2",
		page: "42"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.2 et §5.5",
		page: "95, 127"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.1.2(1)P à (4)P (masses permanentes moyennes = caractéristiques, ψ2,1·Qk,1) ; la moitié supérieure des piles n'est ajoutée qu'en 4.2.2.3(2)P (tablier rigide). Le traitement séparé des piles sous appareils glissants ou en élastomère est du guide."
};
const INERTIES_PILES = {
	id: "inerties_piles",
	type: "regle",
	etape: "modele",
	libelle: "Inertie des piles en béton armé à retenir",
	enonce: "Conception élastique (q = 1) ou à ductilité limitée (q ≤ 1,5) : inerties brutes non fissurées (inertie fissurée sécante également admise). Ponts sur appareils en élastomère fretté : inerties brutes en général. Conception ductile : inertie effective fissurée (annexe C).",
	references: [{
		source: "NF_EN_1998_2",
		localisation: "2.3.6.1 et annexe C",
		page: "31"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §1.5 et §4.3",
		page: "63, 96-99"
	}],
	statut: "via_guide"
};
const RAIDEUR_FUT = {
	id: "raideur_fut",
	type: "formule",
	etape: "modele",
	libelle: "Raideur horizontale d'un fût de pile",
	latex: "K = \\dfrac{3\\,E\\,I}{h^3}\\ \\ \\text{(console : encastré en pied, libre en rotation en tête)}, \\qquad K = \\dfrac{12\\,E\\,I}{h^3}\\ \\ \\text{(encastré en pied et en tête)}",
	variables: [
		{
			symbole: "E",
			description: "module d'élasticité du béton",
			unite: "MPa"
		},
		{
			symbole: "I",
			description: "inertie de flexion du fût dans la direction considérée",
			unite: "m⁴"
		},
		{
			symbole: "h",
			description: "hauteur du fût",
			unite: "m"
		}
	],
	references: [{
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.3.2",
		page: "97-98"
	}],
	statut: "via_guide",
	note: "Voile sollicité dans son plan : ajouter en série la raideur en cisaillement K = G·Sr / h."
};
const RAIDEUR_ELASTOMERE = {
	id: "raideur_elastomere",
	type: "formule",
	etape: "modele",
	libelle: "Raideur horizontale des appareils d'appui en élastomère fretté",
	latex: "K_b = n\\,\\dfrac{G_b\\,A_b}{T_e}",
	variables: [
		{
			symbole: "n",
			description: "nombre d'appareils sur la ligne d'appui",
			unite: "-"
		},
		{
			symbole: "G_b",
			description: "module de cisaillement dynamique",
			unite: "MPa"
		},
		{
			symbole: "A_b",
			description: "surface en plan d'un appareil (a × b)",
			unite: "m²"
		},
		{
			symbole: "T_e",
			description: "épaisseur totale d'élastomère d'un appareil",
			unite: "m"
		}
	],
	conditions: ["Raideurs verticale et en rotation prises infinie et nulle dans le modèle simplifié."],
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "expression A_b·G_b/t_e",
			page: "92"
		},
		{
			source: "NF_EN_1337_3",
			localisation: "5.3.3.7, tableau 4",
			etat: "citee_par_guide"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §4.3.4, tableau 18",
			page: "110"
		}
	],
	statut: "via_guide"
};
const RAIDEUR_SERIE = {
	id: "raideur_ligne_appui",
	type: "formule",
	etape: "modele",
	libelle: "Raideur d'une ligne d'appui (éléments en série) et raideur totale (appuis en parallèle)",
	latex: "\\dfrac{1}{K_i} = \\sum_j \\dfrac{1}{K_{ij}} = \\dfrac{1}{K_{fondation}} + \\dfrac{1}{K_{fût}} + \\dfrac{1}{K_b}, \\qquad K = \\sum_i K_i",
	variables: [{
		symbole: "K_{ij}",
		description: "raideur de la partie j de l'appui i (fondation, fût, appareils)",
		unite: "MN/m"
	}, {
		symbole: "K",
		description: "raideur totale de l'ouvrage dans la direction étudiée",
		unite: "MN/m"
	}],
	references: [{
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.3",
		page: "96-98"
	}],
	statut: "via_guide"
};
const RAIDEUR_TORSION_TABLIER = {
	id: "raideur_torsion_tablier",
	type: "table",
	etape: "modele",
	libelle: "Rigidité de torsion des tabliers en béton sous séisme (fraction de la rigidité brute)",
	symbole: "J_{eff} / J_{brut}",
	unite: "-",
	cles: ["type de tablier"],
	valeurs: {
		profils_ouverts_et_dalles: 0,
		caissons_precontraints: .5,
		caissons_beton_arme: .3
	},
	references: [{
		source: "NF_EN_1998_2",
		localisation: "2.3.6.1",
		page: "31"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.3.1",
		page: "96"
	}],
	statut: "via_guide"
};
const INERTIE_EFFECTIVE = {
	id: "inertie_effective",
	type: "formule",
	etape: "modele",
	libelle: "Inertie effective des éléments ductiles en béton armé (conception ductile)",
	latex: "J_{eff} = 0{,}08\\,J_{un} + J_{cr}\\ \\ \\text{(méthode 1)}, \\qquad E_c\\,J_{eff} = 1{,}2\\,\\dfrac{M_{Rd}}{\\varphi_y}\\ \\ \\text{(méthode 2)}, \\qquad J_{cr} = \\dfrac{M_y}{E_c\\,\\varphi_y}",
	variables: [
		{
			symbole: "J_{un}",
			description: "inertie de la section brute non fissurée",
			unite: "m⁴"
		},
		{
			symbole: "J_{cr}",
			description: "inertie fissurée à la limite élastique",
			unite: "m⁴"
		},
		{
			symbole: "\\varphi_y",
			description: "courbure à la limite élastique",
			unite: "1/m"
		}
	],
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "annexe C (informative) ; E.3.2(3)",
			page: "112"
		},
		{
			source: "NF_EN_1998_2_NA",
			localisation: "AN 4",
			page: "12"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §4.3.3",
			page: "100"
		}
	],
	statut: "via_guide",
	note: "Méthode 1 limitée à la zone effectivement fissurée (AN). Hors V1 (conception ductile)."
};
const BORNES_G = {
	id: "bornes_G_elastomere",
	type: "regle",
	etape: "modele",
	libelle: "Bornes du module G des élastomères : deux analyses",
	enonce: "Analyse avec les propriétés limites inférieures (LBDP : Gb,min = Gb) pour les déplacements maximaux, et supérieures (UBDP : Gb,max = 1,2·Gb si Tmin,b ≥ 0 °C, sinon valeur à Tmin,b) pour les efforts maximaux. Dispense de la fourchette si UBDP et LBDP modifient les déplacements de moins de ±15 %.",
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "7.5.2.4(3)P, (4) et (6) ; valeur 1,2 Gb : amendement A1",
			page: "96"
		},
		{
			source: "NF_EN_1998_2_NA",
			localisation: "J.1(2) : Tmin,b",
			page: "11"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §4.3.4",
			page: "111"
		}
	],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 7.5.2.4(3)P (analyses UBDP et LBDP), (4) (±15 %, propriétés nominales admises) et (6) sont présents ; mais l'édition 2005 donne Gb,max = 1,5·Gb pour Tmin,b ≥ 0 °C. La valeur 1,2·Gb, retenue par le guide, vient de l'amendement A1 (non consulté) : appliquer 1,5·Gb si le marché vise l'EN 2005 sans A1."
};
const AMORTISSEMENT_MATERIAUX = {
	id: "amortissement_materiaux",
	type: "table",
	etape: "modele",
	libelle: "Amortissement visqueux équivalent par matériau",
	symbole: "\\xi",
	unite: "-",
	cles: ["matériau"],
	valeurs: {
		"Acier soudé": .02,
		"Acier boulonné": .04,
		"Béton armé": .05,
		"Béton précontraint": .02,
		"Élastomère fretté à faible amortissement": .05
	},
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.1.3",
		page: "43"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.4",
		page: "114"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.1.3(1) donne acier soudé 0,02, boulonné 0,04, BA 0,05, BP 0,02 ; l'élastomère à faible amortissement (0,05) est en 7.5.2.4(5) et 7.5.1(3)."
};
const AMORTISSEMENT_GLOBAL = {
	id: "amortissement_global",
	type: "formule",
	etape: "modele",
	libelle: "Amortissement global au prorata des énergies de déformation",
	latex: "\\xi = \\dfrac{\\sum_k \\xi_k\\,E_k}{\\sum_k E_k}, \\qquad E_k = \\tfrac{1}{2}\\,V_k\\,d_k",
	variables: [{
		symbole: "\\xi_k",
		description: "amortissement de l'élément k",
		unite: "-"
	}, {
		symbole: "E_k",
		description: "énergie de déformation de l'élément k",
		unite: "MJ"
	}],
	conditions: ["Souplesse provenant entièrement d'élastomères à faible amortissement : ξ = 5 %.", "Simplification admise : retenir le taux le plus faible."],
	references: [{
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.4",
		page: "103, 114"
	}],
	statut: "via_guide"
};
const CONDITIONS_MONOMODAL = {
	id: "conditions_monomodal",
	type: "regle",
	etape: "analyse",
	libelle: "Domaine de la méthode du mode fondamental",
	enonce: "Masse modale du mode fondamental ≥ 90 % de la masse totale (ou ≥ 70 % en majorant les effets par M/ΣMi). Longitudinal : tablier continu à peu près rectiligne, masse des piles < 20 % de celle du tablier. Transversal : excentricité centre de raideur / centre de masse ≤ 5 % de la longueur. Biais : angle > 78 grades et raideurs à ±10 % du pont droit. Courbure : angle balayé < 25°. Exclus : arcs, béquilles, ponts à câbles, encorbellements.",
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "4.2.2.2(1) a) à c) ; 4.2.1.2(2)-(3) pour les masses modales",
			page: "51"
		},
		{
			source: "NF_EN_1998_2",
			localisation: "4.1.5(1)P (biais)",
			page: "44"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §5.3.1",
			page: "116-118"
		}
	],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.2.2.1 est la définition, le domaine d'application est en 4.2.2.2 (masse des piles < 20 % du tablier, eo ≤ 5 % L) ; les seuils de masse modale 90 % / 70 % sont en 4.2.1.2 (analyse multimodale). 4.1.5(1)P impose la torsion pour φ > 20° et pour B/L > 2,0, sans fixer de domaine de validité de la méthode. Angle balayé < 25°, exclusions (arcs, béquilles…) et raideurs à ±10 % du pont droit sont du guide."
};
const TABLIER_RIGIDE = {
	id: "tablier_rigide",
	type: "formule",
	etape: "analyse",
	libelle: "Méthode du mode fondamental, modèle à tablier rigide",
	latex: "K = \\sum_i K_i, \\qquad T = 2\\pi\\sqrt{\\dfrac{M}{K}}, \\qquad F = M\\,S_d(T), \\qquad F_i = \\dfrac{K_i}{K}\\,F, \\qquad d = \\dfrac{T^2}{4\\pi^2}\\,S_e(T)",
	variables: [
		{
			symbole: "M",
			description: "masse sismique du tablier (avec la part des piles le cas échéant)",
			unite: "kg"
		},
		{
			symbole: "K",
			description: "raideur totale des appuis dans la direction étudiée",
			unite: "N/m"
		},
		{
			symbole: "F_i",
			description: "effort repris par l'appui i",
			unite: "N"
		}
	],
	conditions: [
		"Longitudinal : tablier continu.",
		"Transversal : tablier rigide si L/B ≤ 4 ou si l'écart de déplacement transversal Δd/da ≤ 0,20.",
		"Avec q = 1, Sd(T) = Se(T)."
	],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.2.2.3(1) (4.11), (2)P (4.12)-(4.13), (3)",
		page: "51"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.3.2",
		page: "119-121"
	}],
	statut: "via_guide"
};
const CENTRE_RAIDEUR = {
	id: "centre_raideur",
	type: "formule",
	etape: "analyse",
	libelle: "Centre de raideur et excentricité",
	latex: "\\bar{x}_K = \\dfrac{\\sum_i x_i\\,K_i}{\\sum_i K_i}, \\qquad e_0 = \\left|\\bar{x}_K - \\bar{x}_M\\right|",
	variables: [{
		symbole: "x_i",
		description: "abscisse de l'appui i le long du tablier",
		unite: "m"
	}, {
		symbole: "\\bar{x}_M",
		description: "abscisse du centre de masse",
		unite: "m"
	}],
	references: [{
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.3.1",
		page: "117"
	}],
	statut: "via_guide"
};
const TORSION_EXCENTRICITE = {
	id: "torsion_excentricite",
	type: "formule",
	etape: "analyse",
	libelle: "Moment de torsion d'axe vertical",
	latex: "M_t = \\pm\\,e\\,F, \\qquad e = e_0 + e_a, \\qquad e_a = 0{,}05\\,L\\ \\ \\text{(séisme transversal)}\\ \\text{ou}\\ 0{,}05\\,B\\ \\ \\text{(longitudinal, guide)}",
	variables: [{
		symbole: "e_0",
		description: "excentricité entre centre de raideur et centre de masse",
		unite: "m"
	}, {
		symbole: "e_a",
		description: "excentricité accidentelle",
		unite: "m"
	}],
	conditions: ["Ponts biais (φ > 20°, soit un angle de biais < 78 grades) et ponts à B/L > 2,0 (EN 4.1.5(1)P) ; critère du guide pour le biais : angle < 78 grades et B/L > 0,5. Excentricité globale e = ea + ed = 0,08 fois la dimension perpendiculaire à l'excitation (4.1.5(3)P, (4.1))."],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.2.2.5 ; 4.1.5 (biais)",
		page: "53"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.3.4",
		page: "125"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.2.2.5(1) (4.16) ne traite que de la direction transversale : e = eo + 0,05·L ; le terme 0,05·B en longitudinal est du guide. 4.1.5(1)P vise deux familles distinctes, ponts biais (φ > 20°) et ponts larges (B/L > 2,0), et non leur cumul avec B/L > 0,5."
};
const RAYLEIGH = {
	id: "rayleigh",
	type: "formule",
	etape: "analyse",
	libelle: "Méthode du mode fondamental, tablier flexible (quotient de Rayleigh)",
	latex: "T = 2\\pi\\sqrt{\\dfrac{\\sum_i M_i\\,d_i^2}{g\\sum_i M_i\\,d_i}}, \\qquad F_i = \\dfrac{4\\pi^2}{g\\,T^2}\\,S_d(T)\\,d_i\\,M_i, \\qquad M_{ms} = \\dfrac{\\left(\\sum_i M_i\\,d_i\\right)^2}{\\sum_i M_i\\,d_i^2}",
	variables: [
		{
			symbole: "M_i",
			description: "masse du tronçon i (et demi-pile bloquée)",
			unite: "kg"
		},
		{
			symbole: "d_i",
			description: "déplacement du nœud i sous les forces g·Mi appliquées dans la direction étudiée",
			unite: "m"
		},
		{
			symbole: "M_{ms}",
			description: "masse modale sismique",
			unite: "kg"
		}
	],
	conditions: ["Vérifier a posteriori Mms ≥ 0,9·Mtot (tablier et piles), ou Mms ≥ 0,7·Mtot en majorant les effets par Mtot/Mms."],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.2.2.4 (tel qu'imprimé)",
		page: "52"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §4.1 et §5.3.3",
		page: "93, 121-123"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.2.2.4 (tablier flexible) est bien le numéro exact, 4.2.2.3 étant le tablier rigide ; (4.14) et (4.15) conformes avec Sd(T). La vérification Mms ≥ 0,9 (ou 0,7)·Mtot reprend les seuils de 4.2.1.2. Le guide imprime Se(T), confondu avec Sd(T) pour q = 1."
};
const PILE_INDEPENDANTE = {
	id: "pile_independante",
	type: "formule",
	etape: "analyse",
	libelle: "Modèle de la pile indépendante",
	latex: "T_i = 2\\pi\\sqrt{\\dfrac{M_i}{K_i}}, \\qquad F_i = M_i\\,S_d(T_i)",
	variables: [{
		symbole: "M_i",
		description: "masse affectée à la pile i",
		unite: "kg"
	}],
	conditions: ["Admis si 0,90 ≤ Ti/Ti+1 ≤ 1,10 pour toutes les piles adjacentes ; sinon redistribuer les masses."],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.2.2.6(1) (4.17)-(4.18), (2) (4.19)",
		page: "53"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.3.3",
		page: "123"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.2.2.6 limite ce modèle à la direction transversale et à une première approximation pour des analyses préliminaires ; bornes 0,90 et 1,10 incluses."
};
const PERIODE_PILE_CONSOLE = {
	id: "periode_pile_console",
	type: "formule",
	etape: "analyse",
	libelle: "Période propre d'une pile en console (tablier glissant ou sur élastomère)",
	latex: "T = 1{,}784\\sqrt{\\dfrac{\\rho\\,A\\,L^4}{E\\,I}}, \\qquad I_{éq} = \\dfrac{F\\,L^3}{3\\,E\\,d}",
	variables: [
		{
			symbole: "\\rho\\,A",
			description: "masse linéique de la pile",
			unite: "kg/m"
		},
		{
			symbole: "L",
			description: "hauteur de la pile",
			unite: "m"
		},
		{
			symbole: "I_{éq}",
			description: "inertie de la console équivalente (flèche d en tête sous F)",
			unite: "m⁴"
		}
	],
	conditions: ["Liaison fixe tablier-pile : intégrer la moitié supérieure de la pile à la masse du tablier, sans calcul séparé."],
	references: [{
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.5",
		page: "127-128"
	}],
	statut: "via_guide"
};
const SECOND_ORDRE = {
	id: "second_ordre_moment",
	type: "formule",
	etape: "analyse",
	libelle: "Moment additionnel du second ordre en tête d'appui",
	latex: "\\Delta M = \\dfrac{1 + q}{2}\\,d_{Ed}\\,N_{Ed}",
	variables: [{
		symbole: "d_{Ed}",
		description: "déplacement sismique de calcul",
		unite: "m"
	}, {
		symbole: "N_{Ed}",
		description: "effort normal concomitant",
		unite: "MN"
	}],
	conditions: ["À évaluer pour les piles hautes si ΔM dépasse 5 % du moment du premier ordre."],
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "5.4",
			page: "60"
		},
		{
			source: "NF_EN_1998_2_NA",
			localisation: "5.4(1)",
			page: "10"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §5.5",
			page: "129"
		}
	],
	statut: "via_guide",
	note: "EN 1998-2:2005 : (5.3) est la méthode recommandée en note de 5.4(1) (choix national) ; dEd = déplacement transversal relatif des extrémités de l'élément ductile. Le seuil de 5 % est du guide (l'EN parle d'effet défavorable significatif)."
};
const REACTIONS_VERTICALES = {
	id: "reactions_verticales",
	type: "formule",
	etape: "analyse",
	libelle: "Réactions d'appui forfaitaires sous séisme vertical (ouvrage courant régulier)",
	latex: "R_i = \\pm\\,a\\,b\\,\\mu\\,L, \\qquad a = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
	variables: [
		{
			symbole: "a",
			description: "accélération du plateau du spectre vertical",
			unite: "m/s²"
		},
		{
			symbole: "b",
			description: "réaction normalisée (tableau 22 du guide, selon le nombre de travées et Ψ)",
			unite: "-"
		},
		{
			symbole: "\\mu",
			description: "masse linéique du tablier",
			unite: "kg/m"
		},
		{
			symbole: "L",
			description: "portée de la travée principale (travées de rive ΨL)",
			unite: "m"
		}
	],
	conditions: ["Réactions vers le haut et vers le bas, cumulées aux charges permanentes et combinées au séisme horizontal."],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.1.7(3)P (effets verticaux sur les appareils d'appui)",
		page: "47"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.3.5, tableau 22",
		page: "124"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 4.1.7(3)P impose seulement de considérer les effets verticaux sur appareils et attelages, 4.1.7(4) admet le mode fondamental avec le modèle à tablier flexible ; la formule Ri = ±a·b·μ·L et ses coefficients sont du guide."
};
const ligne = (v) => ({
	"Ψ = 0,5": v[0],
	"Ψ = 0,6": v[1],
	"Ψ = 0,7": v[2],
	"Ψ = 0,8": v[3],
	"Ψ = 0,9": v[4],
	"Ψ = 1,0": v[5]
});
const TABLEAU_B_VERTICAL = {
	id: "b_reactions_verticales",
	type: "table",
	etape: "analyse",
	libelle: "Réactions verticales normalisées b (une travée : b = 0,41)",
	symbole: "b",
	unite: "-",
	cles: ["nombre de travées", "réaction"],
	valeurs: {
		"2 travées": {
			R1: ligne([
				.22,
				.24,
				.29,
				.33,
				.34,
				.31
			]),
			R2: ligne([
				.57,
				.49,
				.52,
				.63,
				.78,
				.89
			]),
			R3: ligne([
				.33,
				.31,
				.28,
				.25,
				.25,
				.31
			])
		},
		"3 travées": {
			R1: ligne([
				.22,
				.24,
				.26,
				.26,
				.24,
				.25
			]),
			R2: ligne([
				.45,
				.48,
				.58,
				.69,
				.75,
				.75
			])
		},
		"4 travées et plus": {
			"R1 (culée)": ligne([
				.19,
				.25,
				.29,
				.27,
				.22,
				.24
			]),
			"R2 (1re pile)": ligne([
				.38,
				.42,
				.57,
				.7,
				.69,
				.64
			]),
			"Ri (piles intermédiaires)": ligne([
				.71,
				.62,
				.54,
				.64,
				.82,
				.9
			])
		}
	},
	references: [{
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §5.3.5, tableau 22",
		page: "124"
	}],
	statut: "via_guide",
	note: "Ψ = rapport travée de rive / travée principale."
};
const MODELE = [
	{
		id: "Ecm",
		type: "formule",
		etape: "modele",
		libelle: "Module d'élasticité instantané du béton",
		latex: "E_{cm} = 22\\left(\\dfrac{f_{cm}}{10}\\right)^{0{,}3}\\ \\text{GPa}, \\qquad f_{cm} = f_{ck} + 8\\ \\text{MPa}",
		variables: [{
			symbole: "f_{ck}",
			description: "résistance caractéristique en compression",
			unite: "MPa"
		}, {
			symbole: "f_{cm}",
			description: "résistance moyenne en compression",
			unite: "MPa"
		}],
		references: [{
			source: "NF_EN_1992",
			localisation: "1-1, 3.1.3, tableau 3.1",
			etat: "a_confirmer"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §1.3.1",
			page: "242"
		}],
		statut: "via_guide",
		note: "Le guide retient le module instantané pour les raideurs sous séisme (annexe 1 §2.2.3)."
	},
	{
		id: "Tmin_b",
		type: "formule",
		etape: "modele",
		libelle: "Température minimale des appareils en situation sismique",
		latex: "T_{min,b} = T_0 - \\psi_2\\,(T_0 - T_{min}) + \\Delta T_1, \\qquad \\psi_2 = 0{,}5",
		variables: [
			{
				symbole: "T_0",
				description: "température d'origine (EN 1991-1-5 annexe A)",
				unite: "°C"
			},
			{
				symbole: "T_{min}",
				description: "température minimale de l'air sous abri (EN 1991-1-5 et AN, 6.1.3.2)",
				unite: "°C"
			},
			{
				symbole: "\\Delta T_1",
				description: "7,5 (béton), 5,0 (mixte), −2,5 (acier)",
				unite: "°C"
			}
		],
		references: [{
			source: "NF_EN_1998_2_NA",
			localisation: "J.1(2), tableau J.1 N",
			page: "11-12"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §4.3.4 ; annexe 1 §2.2.2",
			page: "111, 248"
		}],
		statut: "verifie"
	},
	{
		id: "lambda_U",
		type: "formule",
		etape: "modele",
		libelle: "Module des élastomères en propriétés limites supérieures (Tmin,b < 0 °C)",
		latex: "\\lambda_{U,fi} = 1 + (\\lambda_{max,fi} - 1)\\,\\psi_{fi}, \\qquad G_{b,max} = \\lambda_{U,f1}\\,\\lambda_{U,f2}\\,G_b",
		variables: [
			{
				symbole: "\\lambda_{max,f1}",
				description: "facteur de vieillissement (tableau JJ.1)",
				unite: "-"
			},
			{
				symbole: "\\lambda_{max,f2}",
				description: "facteur de température (tableau JJ.2)",
				unite: "-"
			},
			{
				symbole: "\\psi_{fi}",
				description: "coefficient de combinaison (0,70 pour un pont de catégorie III dans l'exemple)",
				unite: "-"
			}
		],
		conditions: ["Tmin,b ≥ 0 °C : Gb,max = 1,2·Gb."],
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "7.5.2.4(6) (A1), annexe J, tableaux JJ.1 et JJ.2",
				page: "135"
			},
			{
				source: "NF_EN_1998_2_NA",
				localisation: "J.2(1) : coefficients λ recommandés",
				page: "12"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 4 §4.3.4 ; annexe 1 §2.2.2",
				page: "111, 249"
			}
		],
		statut: "via_guide",
		note: "EN 1998-2:2005 : annexe J (J.4), (J.5) et tableau J.2, annexe JJ (tableaux JJ.1 : λmax = 1,1 ; JJ.2 : 1,0 / 1,3 / 1,4 / 1,5 à 20 / 0 / −10 / −30 °C) conformes. ψfi du tableau J.2 par classe d'importance de l'EN : III → 0,90, II → 0,70, I → 0,60 ; le 0,70 du guide correspond à la classe II de l'EN (correspondance avec les catégories françaises par l'AN). La règle Gb,max = 1,2·Gb diffère de l'EN 2005 (1,5·Gb) : elle vient de l'amendement A1, via le guide."
	},
	{
		id: "culee_rigide",
		type: "regle",
		etape: "modele",
		libelle: "Raideur propre des culées",
		enonce: "Dans l'exemple du guide, la culée est supposée infiniment rigide en longitudinal (raideur de l'appui = raideur des appareils) ; en transversal, sa raideur est celle des poteaux encastrés en pied et en tête (12EI/h³ par poteau). Les fondations sont supposées infiniment rigides.",
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §1.2.3, §2.2.3 et §2.3",
			page: "242, 249, 250"
		}],
		statut: "via_guide"
	},
	MASSES,
	INERTIES_PILES,
	RAIDEUR_FUT,
	RAIDEUR_ELASTOMERE,
	RAIDEUR_SERIE,
	RAIDEUR_TORSION_TABLIER,
	INERTIE_EFFECTIVE,
	BORNES_G,
	AMORTISSEMENT_MATERIAUX,
	AMORTISSEMENT_GLOBAL,
	CONDITIONS_MONOMODAL,
	TABLIER_RIGIDE,
	CENTRE_RAIDEUR,
	TORSION_EXCENTRICITE,
	RAYLEIGH,
	PILE_INDEPENDANTE,
	PERIODE_PILE_CONSOLE,
	SECOND_ORDRE,
	REACTIONS_VERTICALES,
	TABLEAU_B_VERTICAL,
	{
		id: "analyse_spectrale",
		type: "regle",
		etape: "analyse",
		libelle: "Analyse spectrale multimodale",
		enonce: "Analyse élastique des réponses maximales de tous les modes significatifs, avec les ordonnées du spectre de calcul ; la réponse globale est une combinaison statistique des contributions modales. Applicable dans tous les cas où une analyse linéaire est autorisée. Modèle linéaire discret, en général spatial.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.1.1(1) et (2)P",
			page: "49"
		}],
		statut: "verifie"
	},
	{
		id: "modes_significatifs",
		type: "regle",
		etape: "analyse",
		libelle: "Modes significatifs : 90 % de la masse",
		enonce: "Tous les modes à contribution importante sont pris en compte : critère satisfait si la somme des masses modales effectives des modes retenus atteint 90 % de la masse totale. Si ce n'est pas le cas après tous les modes de période T ≥ 0,033 s, on peut s'arrêter là à condition que ΣMi/M ≥ 0,70, en multipliant les effets par M/ΣMi.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.1.2(1)P à (3)",
			page: "49"
		}],
		statut: "verifie",
		note: "PSIDA retient les modes dans l'ordre des périodes décroissantes jusqu'à 90 %, y compris des modes « rigides » (T < 0,033 s) quand c'est nécessaire, ce qui satisfait directement (2) sans recourir au facteur M/ΣMi de (3)."
	},
	{
		id: "combinaison_modale",
		type: "formule",
		etape: "analyse",
		libelle: "Combinaison des réponses modales (SRSS ou CQC)",
		latex: "E = \\sqrt{\\sum_i E_i^2}\\ \\text{(SRSS)}, \\qquad E = \\sqrt{\\sum_i\\sum_j E_i\\,r_{ij}\\,E_j}\\ \\text{(CQC)}, \\qquad r_{ij} = \\dfrac{8\\sqrt{\\xi_i\\xi_j}\\,(\\xi_i + \\rho_{ij}\\xi_j)\\,\\rho_{ij}^{3/2}}{(1-\\rho_{ij}^2)^2 + 4\\xi_i\\xi_j\\rho_{ij}(1+\\rho_{ij}^2) + 4(\\xi_i^2+\\xi_j^2)\\rho_{ij}^2}",
		variables: [
			{
				symbole: "E_i",
				description: "effet de l'action sismique dans le mode i (signé)",
				unite: "—"
			},
			{
				symbole: "\\rho_{ij}",
				description: "rapport des pulsations ωj/ωi (soit Ti/Tj)",
				unite: "—"
			},
			{
				symbole: "\\xi_i",
				description: "taux d'amortissement visqueux du mode i",
				unite: "—"
			}
		],
		conditions: ["SRSS par défaut ; CQC quand deux périodes sont voisines : 0,1/(0,1 + √(ξiξj)) ≤ Ti/Tj ≤ 1 + 10√(ξiξj).", "L'effet est pris avec les deux signes."],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.1.3(1)P à (3), éq. (4.6) à (4.9)",
			page: "49-50"
		}],
		statut: "verifie"
	},
	{
		id: "modele_dynamique",
		type: "regle",
		etape: "modele",
		libelle: "Modèle dynamique discret de PSIDA (poutres et ressorts)",
		enonce: "Tablier en poutre (8 éléments par travée, 4 au moins au-delà de 6 travées, masse répartie, inertie verticale A·e²/12 et transversale A·B²/12 par défaut, ou saisies), indéformable axialement en X ; fûts de piles en consoles encastrées en pied (4 éléments, masse répartie) ; lignes d'appareils en ressorts (élastomère), liaisons rigides (fixes, butées) ou absentes (glissants) ; culées en ressorts k_appui ; en Z, appuis verticalement indéformables.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.1.1(2)P (modèle linéaire discret)",
			page: "49"
		}],
		statut: "verifie",
		note: "Choix de modélisation propres à PSIDA ; la norme impose seulement un modèle discret approprié, compatible avec la mécanique et l'idéalisation de l'action sismique."
	},
	{
		id: "calcul_temporel_lineaire",
		type: "regle",
		etape: "analyse",
		libelle: "Calcul temporel linéaire (analyse chronologique)",
		enonce: "Méthode linéaire alternative à l'analyse spectrale : l'action sismique de calcul est prise comme la moyenne des réponses extrêmes calculées pour chaque accélérogramme d'un ensemble ; le choix de l'ensemble suit 3.2.3 (EN 1998-2) et 3.2.3.1 (EN 1998-1).",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.3.1(1)P",
			page: "54"
		}, {
			source: "NF_EN_1998_2",
			localisation: "3.2.3 (paires d'accélérogrammes pour l'analyse non linéaire : au moins 3 ; spectre SRSS moyen ≥ 1,3 Se entre 0,2 T1 et 1,5 T1)",
			page: "37"
		}],
		statut: "verifie",
		note: "PSIDA traite chaque direction séparément, avec des accélérogrammes artificiels ajustés au spectre élastique, par superposition modale des modes retenus par l'analyse multimodale ; les directions se combinent ensuite par 100/30/30. Les efforts sont divisés par q, les déplacements restent ceux du calcul élastique."
	},
	{
		id: "accelerogrammes_artificiels",
		type: "regle",
		etape: "action_sismique",
		libelle: "Accélérogrammes artificiels compatibles avec le spectre",
		enonce: "Établis pour correspondre au spectre élastique à 5 % ; durée de la partie stationnaire au moins 10 s à défaut de données ; au moins 3 accélérogrammes ; moyenne des accélérations spectrales à période nulle ≥ ag·S ; entre 0,2 T1 et 2 T1, spectre moyen à 5 % ≥ 90 % du spectre élastique.",
		references: [{
			source: "NF_EN_1998_1",
			localisation: "3.2.3.1.2(1)P à (4)",
			page: "37"
		}],
		statut: "verifie"
	},
	{
		id: "poussee_progressive",
		type: "regle",
		etape: "analyse",
		libelle: "Analyse statique non linéaire en poussée progressive",
		enonce: "Analyse statique non linéaire sous charges horizontales croissantes, jusqu'au déplacement cible au point de référence (centre de masse du tablier) ; le déplacement cible est celui de l'analyse multimodale avec q = 1, fondée sur la rigidité effective des éléments ductiles ; elle donne la répartition des déformations et la séquence de formation des rotules ; vérification : rotation plastique θp,E ≤ θp,d en chaque rotule.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.5",
			page: "56"
		}, {
			source: "NF_EN_1998_2",
			localisation: "Annexe H, H.1 à H.3",
			page: "131"
		}],
		statut: "verifie",
		note: "Annexe H informative, maintenue informative par l'annexe nationale (AN.8), qui précise qu'il existe d'autres méthodes plus élaborées. PSIDA pousse le tablier supposé indéformable dans son plan, appareils et culées élastiques, fûts non linéaires."
	},
	{
		id: "rigidite_effective",
		type: "regle",
		etape: "analyse",
		libelle: "Rigidité effective des fûts en béton armé (méthode 2)",
		enonce: "J_eff = 1,20 M_Rd / (E_c φ_y), où φ_y est la courbure à la limite élastique de l'idéalisation bilinéaire.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "Annexe C, C.3 (C.3)",
			page: "112"
		}],
		statut: "verifie",
		note: "Annexe C informative au niveau national (AN.4)."
	},
	{
		id: "capacite_rotation",
		type: "regle",
		etape: "verif_piles",
		libelle: "Propriétés probables et capacité de rotation plastique",
		enonce: "Matériaux probables : fcm, béton confiné (E.1 à E.10), fym = 1,15 fyk, ftm = 1,20 fyk, εsu = εuk ; θp,u = (φu − φy) Lp (1 − Lp/2L) (E.16b), Lp = 0,10 L + 0,015 fyk dbL (E.19) ; réduction √(αs/3) si αs = L/d < 3 (E.20, E.21) ; θp,d = θp,u / γR,p avec γR,p = 1,40.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "Annexe E, E.2 (E.1) à (E.10)",
			page: "121"
		}, {
			source: "NF_EN_1998_2",
			localisation: "E.3.1(3), E.3.2 (E.16) à (E.21)",
			page: "124"
		}],
		statut: "verifie",
		note: "Annexe E informative au niveau national (AN.6). PSIDA calcule φy et φu par une analyse de section en fibres et une idéalisation bilinéaire à aires égales."
	},
	{
		id: "deplacement_cible_n2",
		type: "regle",
		etape: "analyse",
		libelle: "Déplacement cible par la méthode N2 (bâtiments)",
		enonce: "Système équivalent à un degré de liberté (m*, Γ), idéalisation élasto-plastique à énergies égales (d*y = 2(d*m − E*m/F*y)), T* = 2π √(m* d*y / F*y) ; d*t = Se(T*) (T*/2π)² si T* ≥ TC, sinon corrigé par qu.",
		references: [{
			source: "NF_EN_1998_1",
			localisation: "Annexe B, B.1 à B.5",
			page: "170"
		}],
		statut: "verifie",
		note: "Donné à titre de comparaison : pour les ponts, l'EN 1998-2 H.1 retient le déplacement de l'analyse multimodale."
	},
	{
		id: "calcul_temporel_non_lineaire",
		type: "regle",
		etape: "analyse",
		libelle: "Calcul temporel non linéaire (analyse dynamique non linéaire)",
		enonce: "Intégration directe des équations du mouvement non linéaires sous des accélérogrammes, charges gravitaires et second ordre compris ; en complément d'une analyse spectrale, sauf ponts isolés ou irréguliers ; avec au moins 7 accélérogrammes, la moyenne des réponses est la valeur de calcul, sinon le maximum ; matériaux probables, forme des boucles d'hystérésis représentative ; vérification θp,E ≤ θp,d.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.2.4.1 à 4.2.4.3",
			page: "54"
		}, {
			source: "NF_EN_1998_2",
			localisation: "4.2.4.4(2) (4.22), (4.23)",
			page: "55"
		}],
		statut: "verifie",
		note: "PSIDA : tablier indéformable (un degré de liberté par direction), fûts non linéaires (courbe de la poussée progressive idéalisée en bilinéaire) en série avec les appareils, loi de Takeda modifiée ou bilinéaire cinématique, différences centrales, une direction à la fois avec les accélérogrammes artificiels du calcul temporel linéaire."
	}
];
//#endregion
//#region src/moteur/analyse.ts
const BORNES = ["lbdp", "ubdp"];
/** Interpolation linéaire dans une ligne du tableau 22 (Ψ = 0,5 à 1,0). */
function interpoler(ligne, psi) {
	const pts = Object.entries(ligne).map(([k, v]) => [Number(k.replace("Ψ = ", "").replace(",", ".")), v]).sort((a, b) => a[0] - b[0]);
	const p = Math.min(Math.max(psi, pts[0]?.[0] ?? .5), pts.at(-1)?.[0] ?? 1);
	for (let i = 1; i < pts.length; i++) {
		const [x0, y0] = pts[i - 1] ?? [0, 0];
		const [x1, y1] = pts[i] ?? [0, 0];
		if (p <= x1) return y0 + (p - x0) / (x1 - x0) * (y1 - y0);
	}
	return pts.at(-1)?.[1] ?? NaN;
}
function analyse(p, a, m) {
	const d = derives(p);
	const M = m.masses.M;
	const L = d.longueur;
	const positions = d.positions;
	const notes = {
		conditions: [],
		x: [],
		y: [],
		vertical: [],
		combinaisons: []
	};
	const rapportMasse = m.masses.piles.reduce((s, x) => s + x.masseFuts, 0) / M;
	const LsurB = L / p.tablier.largeur;
	const conditions = [
		{
			id: "tablier_continu",
			libelle: "Tablier continu, droit et à peu près rectiligne",
			valeur: `${p.tablier.travees.length} travée(s), pont droit`,
			respectee: true,
			references: ["conditions_monomodal"]
		},
		{
			id: "masse_piles",
			libelle: "Masse des piles < 20 % de celle du tablier (longitudinal)",
			valeur: `${nombre(100 * rapportMasse, 1)} %`,
			respectee: rapportMasse < .2,
			references: ["conditions_monomodal"]
		},
		{
			id: "L_sur_B",
			libelle: "Tablier rigide en transversal : L/B ≤ 4",
			valeur: `L/B = ${nombre(LsurB, 2)}`,
			respectee: LsurB <= 4,
			references: ["tablier_rigide"]
		}
	];
	const appuisY = m.directions.y.appuis;
	const infinis = appuisY.filter((x) => x.kTotal.lbdp === Infinity);
	const xK = infinis.length ? infinis.reduce((s, x) => s + (positions[p.appuis.findIndex((ap) => ap.id === x.id)] ?? 0), 0) / infinis.length : appuisY.reduce((s, x, i) => s + (positions[i] ?? 0) * x.kTotal.lbdp, 0) / Math.max(m.directions.y.K.lbdp, 1e-12);
	const e0 = Math.abs(xK - L / 2);
	const torsionAppliquee = e0 > .05 * L;
	conditions.push({
		id: "excentricite",
		libelle: "Excentricité centre de raideur / centre de masse ≤ 5 % de L (sinon torsion)",
		valeur: `e0 = ${nombre(e0, 2)} m ; 5 % L = ${nombre(.05 * L, 2)} m`,
		respectee: !torsionAppliquee,
		references: [
			"conditions_monomodal",
			"centre_raideur",
			"torsion_excentricite"
		]
	});
	for (const c of conditions) notes.conditions.push({
		id: c.id,
		titre: c.libelle,
		resultat: {
			symbole: "",
			valeur: `${c.valeur} — ${c.respectee ? "respectée" : "non respectée"}`
		},
		references: c.references,
		niveau: c.respectee ? void 0 : "alerte",
		commentaire: c.respectee ? void 0 : c.id === "excentricite" ? "Moment de torsion ajouté aux efforts transversaux." : c.id === "L_sur_B" ? "Tablier flexible : la méthode de Rayleigh (non traitée en V1) serait plus appropriée ; résultats indicatifs." : "Hors domaine de la méthode du mode fondamental : résultats indicatifs."
	});
	const spectreDe = (dir) => dir === "x" ? a.spectres.calculLong : a.spectres.calculTrans;
	const qDe = (dir) => dir === "x" ? a.q.longitudinal : a.q.transversal;
	const directions = {};
	for (const dir of ["x", "y"]) {
		const nomDir = dir === "x" ? "longitudinale" : "transversale";
		const q = qDe(dir);
		directions[dir] = {};
		for (const borne of BORNES) {
			const K = m.directions[dir].K[borne];
			const T = K === Infinity ? 0 : 2 * Math.PI * Math.sqrt(M / (K * 1e3));
			const Sd = valeur(spectreDe(dir), T);
			const F = M * Sd / 1e3;
			const dEe = K === Infinity || K === 0 ? 0 : F / K;
			const T0 = 1.25 * a.TC;
			const muD = T < .033 ? 1 : T >= T0 ? q : Math.min((q - 1) * (T0 / T) + 1, 5 * q - 4);
			const dE = a.eta * muD * dEe;
			const appuis = m.directions[dir].appuis.map((ap, i) => {
				const Fi = ap.part[borne] * F;
				return {
					id: ap.id,
					x: positions[i] ?? 0,
					F: Fi,
					part: ap.part[borne],
					torsion: 0,
					dTete: ap.kSupport === Infinity ? 0 : Fi / ap.kSupport * a.eta * muD,
					dAppareils: ap.kAppareils[borne] === Infinity || ap.kAppareils[borne] === 0 ? 0 : Fi / ap.kAppareils[borne] * a.eta * muD
				};
			});
			if (dir === "y" && torsionAppliquee) {
				const Mt = (e0 + .05 * L) * F;
				const finis = m.directions.y.appuis.map((ap, i) => ({
					k: ap.kTotal[borne],
					dx: (positions[i] ?? 0) - xK
				}));
				const J = finis.reduce((s, x) => s + (Number.isFinite(x.k) ? x.k * x.dx * x.dx : 0), 0);
				appuis.forEach((ap, i) => {
					const f = finis[i];
					if (!f || !Number.isFinite(f.k) || J === 0) return;
					ap.torsion = Mt * f.k * Math.abs(f.dx) / J;
					ap.F += ap.torsion;
				});
			}
			directions[dir][borne] = {
				K,
				T,
				Sd,
				F,
				dEe,
				muD,
				dE,
				appuis
			};
		}
		const L_ = directions[dir].lbdp;
		const U = directions[dir].ubdp;
		const etiquette = (b) => m.elastomeres ? b === "lbdp" ? "^{LBDP}" : "^{UBDP}" : "";
		for (const borne of m.elastomeres ? BORNES : ["lbdp"]) {
			const r = directions[dir][borne];
			const K = r.K;
			notes[dir].push({
				id: `T_${dir}_${borne}`,
				titre: `Période propre ${nomDir}${m.elastomeres ? ` (${borne.toUpperCase()})` : ""}`,
				formule: "T = 2\\pi\\sqrt{\\dfrac{M}{K}}",
				application: K === Infinity ? "K \\to \\infty" : `2\\pi\\sqrt{\\dfrac{${tex(M * 1e3, 0)}}{${tex(K * 1e6, 0)}}}`,
				resultat: {
					symbole: `T${etiquette(borne)}`,
					valeur: r.T,
					unite: "s",
					decimales: 3
				},
				references: ["tablier_rigide"],
				commentaire: K === Infinity ? "Tablier bloqué sur un appui rigide : période nulle." : void 0
			}, {
				id: `Sd_${dir}_${borne}`,
				titre: `Accélération spectrale (q = ${nombre(q, 2)})`,
				resultat: {
					symbole: `S_d(T)${etiquette(borne)}`,
					valeur: r.Sd,
					unite: "m/s²",
					decimales: 3
				},
				references: ["Sd"],
				commentaire: r.T < a.TB ? "T < TB." : r.T <= a.TC ? "Plateau du spectre (TB ≤ T ≤ TC)." : r.T <= a.TD ? "Branche en 1/T (TC ≤ T ≤ TD)." : "Branche en 1/T² (T > TD)."
			}, {
				id: `F_${dir}_${borne}`,
				titre: "Effort sismique total",
				formule: "F = M\\,S_d(T)",
				application: `${tex(M, 1)}\\ \\text{t} \\times ${tex(r.Sd, 3)}`,
				resultat: {
					symbole: `F${etiquette(borne)}`,
					valeur: r.F,
					unite: "MN",
					decimales: 3
				},
				references: ["tablier_rigide"]
			}, {
				id: `d_${dir}_${borne}`,
				titre: "Déplacement sismique du tablier",
				formule: "d_E = \\eta\\,\\mu_d\\,d_{Ee}, \\qquad d_{Ee} = \\dfrac{F}{K}",
				application: K === Infinity ? "0" : `${tex(a.eta, 3)} \\times ${tex(r.muD, 3)} \\times \\dfrac{${tex(r.F, 3)}}{${tex(K, 2)}}`,
				resultat: {
					symbole: `d_E${etiquette(borne)}`,
					valeur: r.dE * 100,
					unite: "cm",
					decimales: 2
				},
				references: ["mu_d", "tablier_rigide"],
				commentaire: `μd = ${nombre(r.muD, 3)}${q === 1 ? " (q = 1)" : ""}.`
			});
		}
		for (const ap of U.appuis) {
			const apL = L_.appuis.find((x) => x.id === ap.id);
			notes[dir].push({
				id: `F_${dir}_${ap.id}`,
				titre: `${ap.id} — effort ${dir === "x" ? "longitudinal" : "transversal"} transmis par le tablier`,
				formule: "F_i = \\dfrac{k_i}{K}\\,F" + (ap.torsion > 0 ? " + \\dfrac{M_t\\,k_i\\,|x_i - x_K|}{\\sum k_j (x_j - x_K)^2}" : ""),
				application: `${tex(ap.part, 4)} \\times ${tex(U.F, 3)}` + (ap.torsion > 0 ? ` + ${tex(ap.torsion, 3)}` : ""),
				resultat: {
					symbole: `F_{${ap.id}}${etiquette("ubdp")}`,
					valeur: ap.F,
					unite: "MN",
					decimales: 3
				},
				references: ap.torsion > 0 ? ["tablier_rigide", "torsion_excentricite"] : ["tablier_rigide"],
				commentaire: `Déplacement de la tête d'appui${m.elastomeres ? " (LBDP)" : ""} : ${nombre((apL?.dTete ?? 0) * 100, 2)} cm ; distorsion des appareils : ${nombre((apL?.dAppareils ?? 0) * 100, 2)} cm.`
			});
		}
	}
	const t = p.tablier.travees;
	const n = t.length;
	const Lp = Math.max(...t);
	const psi = n >= 2 ? (t[0] ?? 0) / Lp : 1;
	const egal = (u, v) => Math.abs(u - v) <= .05 * Math.max(u, v);
	const regulier = n === 1 || egal(t[0] ?? 0, t[n - 1] ?? 0) && t.slice(1, -1).every((x) => egal(x, Lp)) && psi >= .5 - 1e-9 && psi <= 1 + 1e-9;
	const aV = a.plateaux.Sve;
	const mu = m.masses.masseLineique;
	const reactions = [];
	let motif = "";
	if (!regulier) motif = "Travées de rive inégales, travées intermédiaires différentes ou Ψ hors de [0,5 ; 1] : méthode forfaitaire non applicable.";
	else {
		const tab = TABLEAU_B_VERTICAL.valeurs;
		const bDe = (i) => {
			if (n === 1) return .41;
			const culee = i === 0 || i === n;
			if (n === 2) return culee ? interpoler(i === 0 ? tab["2 travées"]?.R1 ?? {} : tab["2 travées"]?.R3 ?? {}, psi) : interpoler(tab["2 travées"]?.R2 ?? {}, psi);
			if (n === 3) return interpoler((culee ? tab["3 travées"]?.R1 : tab["3 travées"]?.R2) ?? {}, psi);
			const g = tab["4 travées et plus"] ?? {};
			if (culee) return interpoler(g["R1 (culée)"] ?? {}, psi);
			if (i === 1 || i === n - 1) return interpoler(g["R2 (1re pile)"] ?? {}, psi);
			return interpoler(g["Ri (piles intermédiaires)"] ?? {}, psi);
		};
		p.appuis.forEach((ap, i) => {
			const b = bDe(i);
			reactions.push({
				id: ap.id,
				b,
				R: aV * b * mu * Lp / 1e3
			});
		});
		motif = `${n} travée(s), Ψ = ${nombre(psi, 3)}.`;
	}
	notes.vertical.push({
		id: "a_vertical",
		titre: "Accélération du plateau vertical",
		formule: "a = a_{vg}\\,S_T \\cdot 3{,}0\\,\\eta",
		resultat: {
			symbole: "a",
			valeur: aV,
			unite: "m/s²",
			decimales: 3
		},
		references: ["reactions_verticales", "Sve"]
	});
	for (const r of reactions) notes.vertical.push({
		id: `Rv_${r.id}`,
		titre: `${r.id} — réaction verticale sous séisme vertical`,
		formule: "R_i = \\pm\\,a\\,b\\,\\mu\\,L",
		application: `${tex(aV, 3)} \\times ${tex(r.b, 3)} \\times ${tex(mu, 3)}\\ \\text{t/m} \\times ${tex(Lp, 3)}`,
		resultat: {
			symbole: `R_{${r.id}}`,
			valeur: r.R,
			unite: "MN",
			decimales: 3
		},
		references: ["reactions_verticales", "b_reactions_verticales"]
	});
	if (!regulier) notes.vertical.push({
		id: "vertical_na",
		titre: "Méthode forfaitaire",
		resultat: {
			symbole: "",
			valeur: "non applicable"
		},
		references: ["reactions_verticales"],
		commentaire: motif,
		niveau: "alerte"
	});
	const combinaisons = p.appuis.map((ap, i) => {
		const Fx = directions.x.ubdp.appuis[i]?.F ?? 0;
		const Fy = directions.y.ubdp.appuis[i]?.F ?? 0;
		const Fz = reactions[i]?.R ?? 0;
		return {
			id: ap.id,
			cas: [
				{
					nom: "X + 0,3 Y + 0,3 Z",
					Fx,
					Fy: .3 * Fy,
					Fz: .3 * Fz
				},
				{
					nom: "0,3 X + Y + 0,3 Z",
					Fx: .3 * Fx,
					Fy,
					Fz: .3 * Fz
				},
				{
					nom: "0,3 X + 0,3 Y + Z",
					Fx: .3 * Fx,
					Fy: .3 * Fy,
					Fz
				}
			]
		};
	});
	for (const c of combinaisons) notes.combinaisons.push({
		id: `comb_${c.id}`,
		titre: `${c.id} — combinaisons des directions (± sur chaque terme)`,
		formule: "E = \\pm E_1 \\pm 0{,}3\\,E_2 \\pm 0{,}3\\,E_3",
		resultat: {
			symbole: "(F_x ; F_y ; F_z)",
			valeur: c.cas.map((k) => `${k.nom} : (${nombre(k.Fx, 3)} ; ${nombre(k.Fy, 3)} ; ${nombre(k.Fz, 3)}) MN`).join(" — ")
		},
		references: ["combinaison_100_30_30"],
		commentaire: m.elastomeres ? "Efforts horizontaux en propriétés limites supérieures (UBDP)." : void 0
	});
	const note = [
		{
			id: "conditions",
			titre: "Conditions d'application",
			lignes: notes.conditions
		},
		{
			id: "longitudinal",
			titre: "Direction longitudinale",
			lignes: notes.x
		},
		{
			id: "transversal",
			titre: "Direction transversale",
			lignes: notes.y
		},
		{
			id: "vertical",
			titre: "Composante verticale",
			lignes: notes.vertical
		},
		{
			id: "combinaisons",
			titre: "Combinaison des directions",
			lignes: notes.combinaisons
		}
	];
	return {
		M,
		directions,
		torsion: {
			e0,
			L,
			appliquee: torsionAppliquee
		},
		vertical: {
			applicable: regulier,
			motif,
			a: aV,
			mu,
			L: Lp,
			psi,
			reactions
		},
		conditions,
		combinaisons,
		note
	};
}
//#endregion
//#region src/moteur/valeurs-propres.ts
const zeros = (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0));
/** Factorisation de Cholesky : renvoie L triangulaire inférieure telle que A = L Lᵀ. */
function cholesky(A) {
	const n = A.length;
	const L = zeros(n);
	for (let j = 0; j < n; j++) {
		const Lj = L[j];
		let s = A[j][j];
		for (let k = 0; k < j; k++) s -= Lj[k] * Lj[k];
		if (!(s > 0)) throw new Error(`Matrice de masse non définie positive (pivot ${j} : ${s}).`);
		const d = Math.sqrt(s);
		Lj[j] = d;
		for (let i = j + 1; i < n; i++) {
			const Li = L[i];
			let t = A[i][j];
			for (let k = 0; k < j; k++) t -= Li[k] * Lj[k];
			Li[j] = t / d;
		}
	}
	return L;
}
/** Valeurs et vecteurs propres d'une matrice symétrique (Jacobi cyclique). Colonnes de V = vecteurs propres. */
function jacobi(S, tolerance = 1e-12, balayagesMax = 100) {
	const n = S.length;
	const A = S.map((l) => l.slice());
	const V = zeros(n);
	for (let i = 0; i < n; i++) V[i][i] = 1;
	const normeHorsDiag = () => {
		let s = 0;
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += A[i][j] ** 2;
		return Math.sqrt(s);
	};
	let normeDiag = 0;
	for (let i = 0; i < n; i++) normeDiag = Math.max(normeDiag, Math.abs(A[i][i]));
	for (let b = 0; b < balayagesMax; b++) {
		if (normeHorsDiag() <= tolerance * Math.max(normeDiag, 1e-300)) break;
		for (let p = 0; p < n - 1; p++) for (let q = p + 1; q < n; q++) {
			const apq = A[p][q];
			if (Math.abs(apq) < 1e-300) continue;
			const app = A[p][p];
			const theta = (A[q][q] - app) / (2 * apq);
			const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
			const c = 1 / Math.sqrt(t * t + 1), s = t * c;
			for (let k = 0; k < n; k++) {
				const akp = A[k][p], akq = A[k][q];
				A[k][p] = c * akp - s * akq;
				A[k][q] = s * akp + c * akq;
			}
			for (let k = 0; k < n; k++) {
				const apk = A[p][k], aqk = A[q][k];
				A[p][k] = c * apk - s * aqk;
				A[q][k] = s * apk + c * aqk;
			}
			for (let k = 0; k < n; k++) {
				const vkp = V[k][p], vkq = V[k][q];
				V[k][p] = c * vkp - s * vkq;
				V[k][q] = s * vkp + c * vkq;
			}
		}
	}
	return {
		valeurs: A.map((l, i) => l[i]),
		V
	};
}
/** Modes propres de K φ = ω² M φ, triés par pulsation croissante (période décroissante). */
function modesPropres(K, M) {
	const n = K.length;
	if (n === 0) return [];
	const L = cholesky(M);
	const Linv = zeros(n);
	for (let c = 0; c < n; c++) for (let i = 0; i < n; i++) {
		let s = i === c ? 1 : 0;
		for (let k = 0; k < i; k++) s -= L[i][k] * Linv[k][c];
		Linv[i][c] = s / L[i][i];
	}
	const T = zeros(n);
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
		let s = 0;
		for (let k = 0; k <= i; k++) s += Linv[i][k] * K[k][j];
		T[i][j] = s;
	}
	const A = zeros(n);
	for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
		let s = 0;
		for (let k = 0; k <= j; k++) s += T[i][k] * Linv[j][k];
		A[i][j] = s;
		A[j][i] = s;
	}
	const { valeurs, V } = jacobi(A);
	return valeurs.map((w2, c) => {
		const y = V.map((l) => l[c]);
		const phi = new Array(n).fill(0);
		for (let i = n - 1; i >= 0; i--) {
			let s = y[i];
			for (let k = i + 1; k < n; k++) s -= L[k][i] * phi[k];
			phi[i] = s / L[i][i];
		}
		return {
			omega2: Math.max(w2, 0),
			phi
		};
	}).sort((a, b) => a.omega2 - b.omega2);
}
//#endregion
//#region src/moteur/multimodal.ts
const T_RIGIDE = .002;
/** Éléments par travée : 8 jusqu'à 6 travées, puis moins (au moins 4) pour garder un modèle de taille raisonnable. */
const elementsTravee = (nTravees) => Math.max(4, Math.min(8, Math.round(48 / Math.max(nTravees, 1))));
const ELEMENTS_PILE = 4;
/** Matrices de rigidité et de masse cohérente d'un élément de poutre plane (w1, θ1, w2, θ2). */
function elementPoutre(EI, mu, l) {
	const a = EI / l ** 3;
	const k = [
		[
			12 * a,
			6 * l * a,
			-12 * a,
			6 * l * a
		],
		[
			6 * l * a,
			4 * l * l * a,
			-6 * l * a,
			2 * l * l * a
		],
		[
			-12 * a,
			-6 * l * a,
			12 * a,
			-6 * l * a
		],
		[
			6 * l * a,
			2 * l * l * a,
			-6 * l * a,
			4 * l * l * a
		]
	];
	const b = mu * l / 420;
	return {
		k,
		m: [
			[
				156 * b,
				22 * l * b,
				54 * b,
				-13 * l * b
			],
			[
				22 * l * b,
				4 * l * l * b,
				13 * l * b,
				-3 * l * l * b
			],
			[
				54 * b,
				13 * l * b,
				156 * b,
				-22 * l * b
			],
			[
				-13 * l * b,
				-3 * l * l * b,
				-22 * l * b,
				4 * l * l * b
			]
		]
	};
}
/** Construit le modèle dynamique de la direction étudiée. */
function modeleDynamique(p, m, direction, borne) {
	const d = derives(p);
	const E = m.Ecm * 1e3;
	const rho = p.materiaux.beton.masseVolumique;
	const muTablier = (m.masses.tablier + m.masses.trafic) / d.longueur;
	let n = 0;
	const nouveau = () => n++;
	const elements = [];
	const ressorts = [];
	const r = [];
	const translation = [];
	const xs = [0];
	const net = elementsTravee(p.tablier.travees.length);
	for (const t of p.tablier.travees) {
		const x0 = xs.at(-1) ?? 0;
		for (let k = 1; k <= net; k++) xs.push(x0 + t * k / net);
	}
	const ddlTablier = [];
	let inertiesTab = null;
	let masseTablierX = 0;
	if (direction === "x") {
		const u = nouveau();
		translation.push(u);
		xs.forEach(() => ddlTablier.push(u));
		masseTablierX = muTablier * d.longueur;
	} else {
		const I = inertiesTablier(p);
		inertiesTab = direction === "y" ? {
			I: I.transversale,
			saisie: I.saisie.transversale
		} : {
			I: I.verticale,
			saisie: I.saisie.verticale
		};
		const rot = [];
		for (let k = 0; k < xs.length; k++) {
			const w = nouveau();
			translation.push(w);
			ddlTablier.push(w);
			rot.push(nouveau());
		}
		for (let k = 0; k + 1 < xs.length; k++) {
			const l = (xs[k + 1] ?? 0) - (xs[k] ?? 0);
			const el = elementPoutre(E * inertiesTab.I, muTablier, l);
			elements.push({
				e: {
					ddl: [
						ddlTablier[k],
						rot[k],
						ddlTablier[k + 1],
						rot[k + 1]
					],
					k: el.k,
					longueur: l
				},
				m: el.m
			});
		}
	}
	const indicesAppuis = d.positions.map((_, i) => i * net);
	const piles = [];
	const appuis = [];
	const liaisonsRigides = [];
	const raideurs = direction === "z" ? null : m.directions[direction].appuis;
	p.appuis.forEach((ap, ia) => {
		const dT = ddlTablier[indicesAppuis[ia] ?? 0] ?? 0;
		const x = d.positions[ia] ?? 0;
		if (direction === "z") {
			liaisonsRigides.push({
				i: dT,
				j: -1
			});
			appuis.push({
				id: ap.id,
				type: ap.type,
				x,
				ressort: null,
				ddlTablier: dT,
				ddlTete: -1,
				rigide: true,
				kSupport: Infinity,
				kAppareils: Infinity
			});
			return;
		}
		const ra = raideurs[ia];
		const kApp = ra.kAppareils[borne] * 1e3;
		if (ap.type === "culee") {
			const kTot = ra.kTotal[borne] * 1e3;
			const entree = {
				id: ap.id,
				type: ap.type,
				x,
				ressort: null,
				ddlTablier: dT,
				ddlTete: -1,
				rigide: false,
				kSupport: ra.kSupport * 1e3,
				kAppareils: kApp
			};
			if (kTot === Infinity) {
				entree.rigide = true;
				liaisonsRigides.push({
					i: dT,
					j: -1
				});
			} else if (kTot > 0) {
				entree.ressort = {
					i: dT,
					j: -1,
					k: kTot
				};
				ressorts.push(entree.ressort);
			}
			appuis.push(entree);
			return;
		}
		const pile = ap;
		const { Ix, Iy, aire } = inerties(pile);
		const I = direction === "x" ? Ix : Iy;
		const nf = pile.futs.nombre;
		const h = pile.futs.hauteur;
		const EI = nf * E * I;
		const mu = nf * aire * rho;
		const z = [0];
		const ddlW = [-1];
		const ddlR = [-1];
		for (let k = 1; k <= ELEMENTS_PILE; k++) {
			z.push(h * k / ELEMENTS_PILE);
			const w = nouveau();
			translation.push(w);
			ddlW.push(w);
			ddlR.push(nouveau());
		}
		const els = [];
		for (let k = 0; k < ELEMENTS_PILE; k++) {
			const l = h / ELEMENTS_PILE;
			const el = elementPoutre(EI, mu, l);
			const e = {
				ddl: [
					ddlW[k],
					ddlR[k],
					ddlW[k + 1],
					ddlR[k + 1]
				],
				k: el.k,
				longueur: l
			};
			els.push(e);
			elements.push({
				e,
				m: el.m
			});
		}
		const tete = ddlW[ELEMENTS_PILE];
		piles.push({
			id: ap.id,
			appui: ia,
			z,
			ddl: ddlW,
			elements: els,
			masse: mu * h
		});
		const entree = {
			id: ap.id,
			type: ap.type,
			x,
			ressort: null,
			ddlTablier: dT,
			ddlTete: tete,
			rigide: false,
			kSupport: nf * 3 * E * I / h ** 3,
			kAppareils: kApp
		};
		if (kApp === Infinity) {
			entree.rigide = true;
			liaisonsRigides.push({
				i: dT,
				j: tete
			});
		} else if (kApp > 0) {
			entree.ressort = {
				i: dT,
				j: tete,
				k: kApp
			};
			ressorts.push(entree.ressort);
		}
		appuis.push(entree);
	});
	const K = zeros(n);
	const M = zeros(n);
	for (const { e, m: me } of elements) for (let a = 0; a < 4; a++) {
		const ia = e.ddl[a];
		if (ia < 0) continue;
		for (let b = 0; b < 4; b++) {
			const ib = e.ddl[b];
			if (ib < 0) continue;
			K[ia][ib] += e.k[a][b];
			M[ia][ib] += me[a][b];
		}
	}
	if (direction === "x") M[0][0] += masseTablierX;
	for (let i = 0; i < n; i++) r.push(translation.includes(i) ? 1 : 0);
	let masse = 0;
	for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) masse += r[i] * M[i][j] * r[j];
	const kRigide = masse * (2 * Math.PI / T_RIGIDE) ** 2;
	for (const l of liaisonsRigides) {
		const s = {
			i: l.i,
			j: l.j,
			k: kRigide
		};
		ressorts.push(s);
		const ap = appuis.find((a) => a.rigide && a.ddlTablier === l.i && (l.j === -1 ? a.ddlTete === -1 : a.ddlTete === l.j) && !a.ressort);
		if (ap) ap.ressort = s;
	}
	for (const s of ressorts) {
		if (s.i >= 0) K[s.i][s.i] += s.k;
		if (s.j >= 0) K[s.j][s.j] += s.k;
		if (s.i >= 0 && s.j >= 0) {
			K[s.i][s.j] -= s.k;
			K[s.j][s.i] -= s.k;
		}
	}
	return {
		direction,
		borne,
		n,
		K,
		M,
		r,
		masse,
		tablier: {
			x: xs,
			ddl: ddlTablier
		},
		piles,
		appuis,
		kRigide,
		inerties: inertiesTab
	};
}
/** Coefficient de corrélation CQC (EN 1998-2 éq. 4.9), amortissements ξi, ξj, rapport ρ = ωj/ωi. */
function correlationCQC(xi, xj, rapport) {
	const r = rapport;
	const num = 8 * Math.sqrt(xi * xj) * (xi + r * xj) * r ** 1.5;
	const den = (1 - r * r) ** 2 + 4 * xi * xj * r * (1 + r * r) + 4 * (xi * xi + xj * xj) * r * r;
	return den === 0 ? 1 : num / den;
}
/** Deux périodes sont « voisines » au sens de l'EN 1998-2 éq. 4.7. */
function periodesVoisines(Ti, Tj, xi, xj) {
	return Math.min(Ti, Tj) / Math.max(Ti, Tj) >= .1 / (.1 + Math.sqrt(xi * xj)) - 1e-12;
}
function combiner(valeurs, omegas, xi, regle) {
	if (regle === "SRSS") return Math.sqrt(valeurs.reduce((s, v) => s + v * v, 0));
	let s = 0;
	for (let i = 0; i < valeurs.length; i++) for (let j = 0; j < valeurs.length; j++) {
		const wi = omegas[i], wj = omegas[j];
		const rho = i === j ? 1 : correlationCQC(xi, xi, wj / wi);
		s += valeurs[i] * rho * valeurs[j];
	}
	return Math.sqrt(Math.max(s, 0));
}
/** Grandeurs par appui pour un champ de déplacements u (m) du modèle dynamique (signées). */
function grandeursAppuis(md, u) {
	const val = (i) => i < 0 ? 0 : u[i] ?? 0;
	return md.appuis.map((ap) => {
		const F = ap.ressort ? ap.ressort.k * (val(ap.ressort.i) - val(ap.ressort.j)) / 1e3 : 0;
		const dTablier = val(ap.ddlTablier);
		let dTete, dAppareils;
		if (ap.type === "pile" && md.direction !== "z") {
			dTete = val(ap.ddlTete);
			dAppareils = dTablier - dTete;
		} else {
			dTete = Number.isFinite(ap.kSupport) && ap.kSupport > 0 ? F * 1e3 / ap.kSupport : 0;
			dAppareils = Number.isFinite(ap.kAppareils) && ap.kAppareils > 0 ? F * 1e3 / ap.kAppareils : 0;
		}
		const g = {
			F,
			dTablier,
			dTete,
			dAppareils
		};
		const pile = md.piles.find((pl) => pl.id === ap.id);
		if (pile) {
			const base = pile.elements[0];
			const ue = base.ddl.map((i) => val(i));
			const f = base.k.map((l) => l.reduce((s, v, j) => s + v * ue[j], 0));
			g.Vpied = (f[0] ?? 0) / 1e3;
			g.Mpied = (f[1] ?? 0) / 1e3;
		}
		return g;
	});
}
/** Réponse spectrale multimodale dans une direction. */
function reponseDirection(p, a, m, direction, borne) {
	const md = modeleDynamique(p, m, direction, borne);
	const spectre = direction === "x" ? a.spectres.calculLong : direction === "y" ? a.spectres.calculTrans : a.spectres.elastiqueV;
	const q = direction === "x" ? a.q.longitudinal : direction === "y" ? a.q.transversal : 1;
	const xi = p.comportement.amortissement / 100;
	const bruts = modesPropres(md.K, md.M);
	const modes = [];
	let cumul = 0;
	const translationsTablier = md.tablier.ddl;
	bruts.forEach((b, k) => {
		const omega = Math.sqrt(b.omega2);
		let gamma = 0;
		for (let i = 0; i < md.n; i++) {
			let s = 0;
			for (let j = 0; j < md.n; j++) s += md.M[i][j] * md.r[j];
			gamma += b.phi[i] * s;
		}
		const signe = gamma < 0 ? -1 : 1;
		const phi = b.phi.map((v) => v * signe);
		gamma *= signe;
		const Meff = gamma * gamma;
		cumul += Meff;
		const T = omega > 0 ? 2 * Math.PI / omega : Infinity;
		const tab = translationsTablier.map((i) => phi[i] ?? 0);
		const pil = md.piles.map((pl) => pl.ddl.map((i) => i < 0 ? 0 : phi[i] ?? 0));
		const max = Math.max(1e-300, ...tab.map(Math.abs), ...pil.flat().map(Math.abs));
		modes.push({
			numero: k + 1,
			T,
			omega,
			gamma,
			masseEffective: Meff,
			part: Meff / md.masse,
			cumul: cumul / md.masse,
			Sd: valeur(spectre, Number.isFinite(T) ? T : 10),
			retenu: false,
			forme: {
				tablier: tab.map((v) => v / max),
				piles: pil.map((l) => l.map((v) => v / max))
			}
		});
		bruts[k].phi = phi;
	});
	const alertes = [];
	const partSouples = modes.filter((x) => x.T >= .033).reduce((s, x) => s + x.part, 0);
	let retenus = 0;
	let somme = 0;
	for (const x of modes) {
		if (somme >= .9 - 1e-9) break;
		x.retenu = true;
		retenus++;
		somme += x.part;
	}
	const facteur = 1;
	if (partSouples < .9) alertes.push(`Les modes de période ≥ 0,033 s ne mobilisent que ${nombre(100 * partSouples, 1)} % de la masse : ` + (partSouples >= .7 ? `l'EN 1998-2 4.2.1.2(3) admettrait de s'arrêter là en multipliant les effets par M/ΣMi = ${nombre(1 / partSouples, 3)} ; PSIDA complète plutôt par les modes « rigides » (T < 0,033 s), jusqu'à 90 %.` : "moins de 70 % : il faut retenir les modes « rigides » (T < 0,033 s), ce que fait PSIDA, jusqu'à 90 %."));
	const ret = modes.filter((x) => x.retenu);
	const voisins = [];
	for (let i = 0; i < ret.length; i++) for (let j = i + 1; j < ret.length; j++) {
		const a1 = ret[i], a2 = ret[j];
		if (a1.part > 1e-4 && a2.part > 1e-4 && Number.isFinite(a1.T) && periodesVoisines(a1.T, a2.T, xi, xi)) voisins.push([a1.numero, a2.numero]);
	}
	const regle = voisins.length ? "CQC" : "SRSS";
	const omegas = ret.map((x) => x.omega);
	const dominant = ret.reduce((b, x) => x.masseEffective > b.masseEffective ? x : b, ret[0] ?? modes[0]);
	const T0 = 1.25 * a.TC;
	const Td = dominant?.T ?? 0;
	const muD = direction === "z" ? 1 : Td < .033 ? 1 : Td >= T0 ? q : Math.min((q - 1) * (T0 / Td) + 1, 5 * q - 4);
	const eta = direction === "z" ? 1 : a.eta;
	const ampD = eta * muD;
	const deplacements = ret.map((x) => {
		const phi = bruts[x.numero - 1].phi;
		const c = x.omega > 0 ? x.gamma * x.Sd / (x.omega * x.omega) : 0;
		return phi.map((v) => v * c);
	});
	const comb = (v) => facteur * combiner(v, omegas, xi, regle);
	const parMode = deplacements.map((u) => grandeursAppuis(md, u));
	const appuis = md.appuis.map((ap, ia) => {
		const g = parMode.map((gm) => gm[ia]);
		const Fm = g.map((x) => x.F);
		const sortie = {
			id: ap.id,
			type: ap.type,
			x: ap.x,
			F: comb(Fm),
			dTablier: ampD * comb(g.map((x) => x.dTablier)),
			dTete: ampD * comb(g.map((x) => x.dTete)),
			dAppareils: ampD * comb(g.map((x) => x.dAppareils)),
			Fmodes: Fm
		};
		if (g[0]?.Vpied !== void 0) {
			sortie.Vpied = comb(g.map((x) => x.Vpied ?? 0));
			sortie.Mpied = comb(g.map((x) => x.Mpied ?? 0));
		}
		return sortie;
	});
	const Ftablier = comb(ret.map((_, k) => appuis.reduce((s, ap) => s + (ap.Fmodes[k] ?? 0), 0)));
	const FtotModes = ret.map((x) => x.masseEffective * x.Sd / 1e3);
	const FtotalSRSS = facteur * combiner(FtotModes, omegas, xi, "SRSS");
	const FtotalCQC = facteur * combiner(FtotModes, omegas, xi, "CQC");
	const massePiles = md.piles.reduce((s, x) => s + x.masse, 0);
	return {
		direction,
		borne,
		modele: {
			n: md.n,
			masse: md.masse,
			kRigide: md.kRigide,
			inertie: md.inerties,
			massePiles
		},
		geometrie: {
			xTablier: md.tablier.x,
			appuis: md.appuis.map((x) => ({
				id: x.id,
				type: x.type,
				x: x.x,
				teteCulee: x.type !== "culee" || !Number.isFinite(x.kSupport) || x.kSupport <= 0 ? 0 : x.rigide ? 1 : (x.ressort?.k ?? 0) / x.kSupport
			})),
			piles: md.piles.map((pl) => ({
				id: pl.id,
				x: md.appuis[pl.appui]?.x ?? 0,
				z: pl.z
			}))
		},
		modes,
		retenus,
		partRetenue: somme,
		partSouples,
		facteur,
		regle,
		voisins,
		xi,
		q,
		muD,
		eta,
		Ftablier,
		Ftotal: regle === "CQC" ? FtotalCQC : FtotalSRSS,
		FtotalSRSS,
		FtotalCQC,
		appuis,
		alertes
	};
}
const NOMS = {
	x: "longitudinale (X)",
	y: "transversale (Y)",
	z: "verticale (Z)"
};
/** Analyse multimodale complète, comparaison au mode fondamental et note de calcul. */
function multimodale(p, a, m, mono) {
	const bornes = ["lbdp", "ubdp"];
	const dir = (d) => Object.fromEntries(bornes.map((b) => [b, reponseDirection(p, a, m, d, b)]));
	const directions = {
		x: dir("x"),
		y: dir("y"),
		z: reponseDirection(p, a, m, "z", "lbdp")
	};
	const comparaison = ["x", "y"].map((d) => {
		const mu = directions[d].ubdp, ml = directions[d].lbdp;
		const mo = mono.directions[d];
		const T1 = ml.modes.find((x) => x.retenu && x.part > .05)?.T ?? ml.modes[0]?.T ?? 0;
		return {
			direction: d,
			Tmono: mo.lbdp.T,
			T1,
			Fmono: mo.ubdp.F,
			Fmulti: mu.Ftablier,
			FbaseMulti: mu.Ftotal,
			appuis: mu.appuis.map((x, i) => ({
				id: x.id,
				Fmono: mo.ubdp.appuis[i]?.F ?? 0,
				Fmulti: x.F
			}))
		};
	});
	const combinaisons = p.appuis.map((ap, i) => {
		const Fx = directions.x.ubdp.appuis[i]?.F ?? 0;
		const Fy = directions.y.ubdp.appuis[i]?.F ?? 0;
		const Fz = directions.z.appuis[i]?.F ?? 0;
		return {
			id: ap.id,
			cas: [
				{
					nom: "X + 0,3 Y + 0,3 Z",
					Fx,
					Fy: .3 * Fy,
					Fz: .3 * Fz
				},
				{
					nom: "0,3 X + Y + 0,3 Z",
					Fx: .3 * Fx,
					Fy,
					Fz: .3 * Fz
				},
				{
					nom: "0,3 X + 0,3 Y + Z",
					Fx: .3 * Fx,
					Fy: .3 * Fy,
					Fz
				}
			]
		};
	});
	const note = [];
	const lignesModele = [];
	const I = inertiesTablier(p);
	lignesModele.push({
		id: "mm_modele",
		titre: "Modèle dynamique discret",
		resultat: {
			symbole: "",
			valeur: `tablier : ${elementsTravee(p.tablier.travees.length)} éléments de poutre par travée ; piles : ${ELEMENTS_PILE} éléments par fût, encastrés en pied ; masses cohérentes`
		},
		references: ["analyse_spectrale", "modele_dynamique"],
		commentaire: "Liaisons rigides (appareils fixes, butées, culées rigides, appuis en Z) représentées par des ressorts très raides (période propre de 2 ms)."
	}, {
		id: "mm_inerties",
		titre: "Inerties du tablier",
		formule: "I_V = \\dfrac{A\\,e^2}{12}, \\qquad I_T = \\dfrac{A\\,B^2}{12}\\quad\\text{(par défaut)}",
		resultat: {
			symbole: "I_V ;\\ I_T",
			valeur: `${nombre(I.verticale, 4)} m⁴ ${I.saisie.verticale ? "(saisie)" : "(défaut)"} ; ${nombre(I.transversale, 2)} m⁴ ${I.saisie.transversale ? "(saisie)" : "(défaut)"}`,
			unite: ""
		},
		references: ["modele_dynamique"]
	}, {
		id: "mm_equation",
		titre: "Modes propres",
		formule: "\\mathbf{K}\\,\\boldsymbol{\\varphi}_k = \\omega_k^2\\,\\mathbf{M}\\,\\boldsymbol{\\varphi}_k,\\quad T_k = \\dfrac{2\\pi}{\\omega_k},\\quad \\Gamma_k = \\boldsymbol{\\varphi}_k^{T}\\mathbf{M}\\,\\mathbf{r},\\quad M_k = \\Gamma_k^2\\ (\\boldsymbol{\\varphi}_k^T\\mathbf{M}\\boldsymbol{\\varphi}_k = 1)",
		resultat: {
			symbole: "",
			valeur: "Cholesky M = L Lᵀ puis Jacobi"
		},
		references: ["analyse_spectrale", "modes_significatifs"]
	});
	note.push({
		id: "mm_modele",
		titre: "Modèle dynamique",
		lignes: lignesModele
	});
	for (const [d, rep] of [
		["x", directions.x.lbdp],
		["y", directions.y.lbdp],
		["z", directions.z]
	]) {
		const repU = d === "z" ? directions.z : directions[d].ubdp;
		const lignes = [];
		lignes.push({
			id: `mm_${d}_masse`,
			titre: `Masse mobilisable du modèle (${NOMS[d]})`,
			formule: "M = \\mathbf{r}^T\\mathbf{M}\\,\\mathbf{r}",
			resultat: {
				symbole: "M",
				valeur: rep.modele.masse,
				unite: "t",
				decimales: 1
			},
			references: ["modes_significatifs"],
			commentaire: `${rep.modele.n} degrés de liberté${rep.modele.massePiles > 0 ? ` ; masse des fûts de piles ${nombre(rep.modele.massePiles, 1)} t (hors pieds encastrés)` : ""}.`
		});
		for (const x of rep.modes.filter((k) => k.retenu || k.numero <= 3)) lignes.push({
			id: `mm_${d}_mode${x.numero}`,
			titre: `Mode ${x.numero}${x.retenu ? "" : " (non retenu)"}`,
			application: `T = ${tex(x.T, 3)}\\ \\text{s},\\ M_k = ${tex(x.masseEffective, 1)}\\ \\text{t},\\ S_d = ${tex(x.Sd, 3)}\\ \\text{m/s}^2`,
			resultat: {
				symbole: "M_k / M ;\\ \\sum",
				valeur: `${nombre(100 * x.part, 1)} % ; ${nombre(100 * x.cumul, 1)} %`
			},
			references: ["modes_significatifs"]
		});
		lignes.push({
			id: `mm_${d}_critere`,
			titre: "Modes significatifs : ΣMk ≥ 90 % de M",
			resultat: {
				symbole: "\\sum M_k / M",
				valeur: `${nombre(100 * rep.partRetenue, 1)} % avec ${rep.retenus} mode(s)`
			},
			references: ["modes_significatifs"],
			commentaire: rep.alertes.join(" ") || `Modes de période ≥ 0,033 s : ${nombre(100 * rep.partSouples, 1)} % de la masse.`,
			niveau: rep.partSouples < .9 ? "info" : void 0
		});
		lignes.push({
			id: `mm_${d}_regle`,
			titre: "Combinaison des réponses modales",
			formule: rep.regle === "SRSS" ? "E = \\sqrt{\\sum_k E_k^2}" : "E = \\sqrt{\\sum_i\\sum_j E_i\\,r_{ij}\\,E_j}",
			resultat: {
				symbole: "",
				valeur: rep.regle === "SRSS" ? "SRSS (périodes bien séparées)" : `CQC (périodes voisines : ${rep.voisins.map(([i, j]) => `${i}-${j}`).join(", ")})`
			},
			references: ["combinaison_modale"]
		});
		if (d !== "z") lignes.push({
			id: `mm_${d}_Ftab`,
			titre: "Effort transmis par le tablier aux appuis",
			formule: "F_{tablier} = \\text{comb}_k \\Big(\\sum_i F_{i,k}\\Big)",
			resultat: {
				symbole: "F_{tablier}^{UBDP}",
				valeur: repU.Ftablier,
				unite: "MN",
				decimales: 3
			},
			references: ["combinaison_modale"],
			commentaire: "Grandeur comparable à l'effort F = M·Sd(T) du mode fondamental (masse du tablier seule)."
		}, {
			id: `mm_${d}_F`,
			titre: "Effort total à la base (inertie des fûts comprise)",
			formule: "F_{base} = \\text{comb}_k\\,(M_k\\,S_d(T_k))",
			resultat: {
				symbole: "F_{base}^{UBDP}",
				valeur: repU.Ftotal,
				unite: "MN",
				decimales: 3
			},
			references: ["combinaison_modale"],
			commentaire: `SRSS : ${nombre(repU.FtotalSRSS, 3)} MN ; CQC : ${nombre(repU.FtotalCQC, 3)} MN. μd = ${nombre(rep.muD, 3)} (mode dominant), η = ${nombre(rep.eta, 3)}.`
		});
		for (const ap of repU.appuis) {
			const apL = rep.appuis.find((k) => k.id === ap.id);
			lignes.push({
				id: `mm_${d}_${ap.id}`,
				titre: `${ap.id} — ${d === "z" ? "réaction verticale sismique" : `effort ${d === "x" ? "longitudinal" : "transversal"} transmis par le tablier`}`,
				resultat: {
					symbole: `F_{${ap.id}}${d === "z" ? "" : "^{UBDP}"}`,
					valeur: ap.F,
					unite: "MN",
					decimales: 3
				},
				references: ["combinaison_modale"],
				commentaire: d === "z" ? void 0 : `Déplacement du tablier (LBDP) ${nombre((apL?.dTablier ?? 0) * 100, 2)} cm ; distorsion des appareils ${nombre((apL?.dAppareils ?? 0) * 100, 2)} cm` + (ap.Mpied !== void 0 ? ` ; pied de pile : V = ${nombre(ap.Vpied ?? 0, 3)} MN, M = ${nombre(ap.Mpied, 3)} MN·m (UBDP).` : ".")
			});
		}
		note.push({
			id: `mm_${d}`,
			titre: `Direction ${NOMS[d]}`,
			lignes
		});
	}
	const lignesComp = comparaison.map((c) => ({
		id: `mm_comp_${c.direction}`,
		titre: `Comparaison au mode fondamental — direction ${NOMS[c.direction]}`,
		resultat: {
			symbole: "T_1 ;\\ F",
			valeur: `T₁ = ${nombre(c.T1, 3)} s (mode fondamental : ${nombre(c.Tmono, 3)} s) ; effort transmis par le tablier ${nombre(c.Fmulti, 3)} MN (mode fondamental : ${nombre(c.Fmono, 3)} MN, écart ${nombre(100 * (c.Fmulti / c.Fmono - 1), 1)} %) ; effort total à la base ${nombre(c.FbaseMulti, 3)} MN`
		},
		references: ["tablier_rigide", "combinaison_modale"]
	}));
	note.push({
		id: "mm_comparaison",
		titre: "Comparaison des méthodes",
		lignes: lignesComp
	});
	return {
		directions,
		comparaison,
		combinaisons,
		note
	};
}
//#endregion
//#region src/referentiel/combinaisons.ts
const COMBINAISON_100_30_30 = {
	id: "combinaison_100_30_30",
	type: "formule",
	etape: "combinaisons",
	libelle: "Combinaison des trois composantes du séisme (règle 100 % / 30 % / 30 %)",
	latex: "E = \\pm E_1 \\pm 0{,}3\\,E_2 \\pm 0{,}3\\,E_3",
	variables: [{
		symbole: "E_1,\\,E_2,\\,E_3",
		description: "effets du séisme dans chacune des trois directions, la direction 1 étant prépondérante",
		unite: ""
	}],
	conditions: ["24 combinaisons : 3 permutations de la direction prépondérante × 2³ signes."],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.2.1.4(2)",
		page: "50"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §3.2",
		page: "89"
	}],
	statut: "via_guide"
};
const COMBINAISON_SRSS = {
	id: "combinaison_srss",
	type: "formule",
	etape: "combinaisons",
	libelle: "Combinaison quadratique des trois composantes du séisme",
	latex: "E = \\sqrt{E_1^2 + E_2^2 + E_3^2}",
	variables: [{
		symbole: "E_1,\\,E_2,\\,E_3",
		description: "effets du séisme dans chacune des trois directions",
		unite: ""
	}],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "4.2.1.4(1)",
		page: "50"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §3.2",
		page: "90"
	}],
	statut: "via_guide"
};
const COMBINAISON_SISMIQUE = {
	id: "combinaison_sismique",
	type: "formule",
	etape: "combinaisons",
	libelle: "Combinaison des actions dans la situation sismique de calcul",
	latex: "E_d = G_k \\ \\text{“+”}\\ P_k \\ \\text{“+”}\\ A_{Ed} \\ \\text{“+”}\\ \\psi_{2,1}\\,Q_{1k} \\ \\text{“+”}\\ Q_2",
	variables: [
		{
			symbole: "G_k",
			description: "actions permanentes (valeur caractéristique)",
			unite: ""
		},
		{
			symbole: "P_k",
			description: "précontrainte (valeur caractéristique)",
			unite: ""
		},
		{
			symbole: "A_{Ed}",
			description: "action sismique de calcul",
			unite: ""
		},
		{
			symbole: "Q_{1k}",
			description: "charges de trafic (valeur caractéristique)",
			unite: ""
		},
		{
			symbole: "Q_2",
			description: "valeur quasi permanente des actions de longue durée (poussée des terres, flottabilité…)",
			unite: ""
		}
	],
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "5.5",
			page: "60"
		},
		{
			source: "NF_EN_1990",
			localisation: "6.4.3.4 et annexe A2",
			etat: "a_confirmer"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §3.3",
			page: "90"
		}
	],
	statut: "via_guide",
	note: "« + » signifie « combiné à »."
};
const COMBINAISON_EQUIPEMENTS = {
	id: "combinaison_equipements",
	type: "formule",
	etape: "combinaisons",
	libelle: "Combinaison sismique pour les appareils d'appui et les joints",
	latex: "E_d = G_k \\ \\text{“+”}\\ P_k \\ \\text{“+”}\\ A_{Ed} \\ \\text{“+”}\\ \\psi_{2,1}\\,Q_{1k} \\ \\text{“+”}\\ Q_2 \\ \\text{“+”}\\ 0{,}5\\,S_{Th} \\ \\text{“+”}\\ S_{diff}",
	variables: [{
		symbole: "S_{Th}",
		description: "effets de la variation uniforme de température",
		unite: ""
	}, {
		symbole: "S_{diff}",
		description: "effets des déformations différées (retrait, fluage)",
		unite: ""
	}],
	references: [{
		source: "NF_EN_1998_2",
		localisation: "2.3.6.3(2)",
		page: "33"
	}, {
		source: "GUIDE_CEREMA_2015",
		localisation: "ch. 4 §3.3",
		page: "91"
	}],
	statut: "via_guide",
	note: "EN 1998-2:2005 : 2.3.6.3(2)P combine des déplacements ; la prise en compte des déformations imposées dans la combinaison d'actions relève de 5.5(3)P (ponts sur élastomère fretté). Le 0,5 sur STh est le ψ2 de l'EN 1990."
};
const LG = {
	id: "Lg",
	type: "table",
	etape: "combinaisons",
	libelle: "Distance au-delà de laquelle les mouvements du sol sont indépendants",
	symbole: "L_g",
	unite: "m",
	cles: ["classe de sol"],
	valeurs: {
		A: 600,
		B: 500,
		C: 400,
		D: 300,
		E: 500
	},
	references: [
		{
			source: "NF_EN_1998_2",
			localisation: "3.3(6), note 1",
			page: "40"
		},
		{
			source: "NF_EN_1998_2_NA",
			localisation: "3.3(6) note 1",
			page: "10"
		},
		{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §3.4, tableau 15",
			page: "91"
		}
	],
	statut: "via_guide",
	note: "L'AN retient les valeurs recommandées de l'EN."
};
const COMBINAISONS = [
	COMBINAISON_100_30_30,
	COMBINAISON_SRSS,
	COMBINAISON_SISMIQUE,
	COMBINAISON_EQUIPEMENTS,
	LG,
	{
		id: "L_lim",
		type: "formule",
		etape: "combinaisons",
		libelle: "Longueur de tablier continu au-delà de laquelle la variabilité spatiale est à considérer",
		latex: "L_{lim} = \\dfrac{L_g}{1{,}5}",
		variables: [{
			symbole: "L_g",
			description: "distance d'indépendance des mouvements du sol",
			unite: "m"
		}],
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "3.3",
				page: "38"
			},
			{
				source: "NF_EN_1998_2_NA",
				localisation: "3.3(1)P",
				page: "9-10"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 4 §3.4",
				page: "91"
			}
		],
		statut: "via_guide",
		note: "Le guide arrondit Llim à 400, 330, 270, 200 et 330 m."
	},
	{
		id: "deplacements_differentiels",
		type: "formule",
		etape: "combinaisons",
		libelle: "Déplacements différentiels imposés aux appuis (deux séries appliquées séparément)",
		latex: "d_{1i} = \\dfrac{L_i}{L_g}\\,d_g\\sqrt{2} \\le d_g\\sqrt{2}, \\qquad d_{2i} = \\pm\\dfrac{1}{2}\\,\\beta_r\\,\\dfrac{d_g\\sqrt{2}}{L_g}\\,L_{av,i}",
		variables: [
			{
				symbole: "L_i",
				description: "distance de l'appui i à l'appui de référence",
				unite: "m"
			},
			{
				symbole: "L_{av,i}",
				description: "moyenne des distances de l'appui i aux appuis adjacents",
				unite: "m"
			},
			{
				symbole: "\\beta_r",
				description: "0,5 si les trois appuis sont sur le même sol, 1,0 sinon",
				unite: "-"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "3.3(6)",
			page: "39"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §3.4",
			page: "92"
		}],
		statut: "via_guide"
	},
	{
		id: "combinaison_variabilite",
		type: "formule",
		etape: "combinaisons",
		libelle: "Cumul de la réponse vibratoire et des déplacements différentiels",
		latex: "A_{Ed} = \\sqrt{A_{vib}^2 + A_{dépl\\,diff}^2}",
		variables: [{
			symbole: "A_{vib}",
			description: "effets de la réponse inertielle",
			unite: ""
		}, {
			symbole: "A_{dépl\\,diff}",
			description: "effets des déplacements différentiels",
			unite: ""
		}],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "3.3",
			page: "41"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §3.4",
			page: "91-92"
		}],
		statut: "a_verifier",
		note: "EN 1998-2:2005 : 3.3(7) impose le cumul quadratique de la réponse inertielle et des déplacements différentiels ; ce que 3.3(6) dispense de combiner, ce sont les deux ensembles A et B entre eux."
	},
	{
		id: "composante_verticale_a_considerer",
		type: "regle",
		etape: "analyse",
		libelle: "Quand considérer la composante verticale",
		enonce: "Zones 2 et 3 : tabliers en béton précontraint (composante ascendante, à vide), appareils d'appui et attelages. Zones 4 et 5 : en plus, piles très fléchies sous les actions permanentes du tablier, ou pont à moins de 5 km d'une faille active.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.7 ; 4.1.7(2)P pour le béton précontraint",
			page: "47"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 3 §4.4 ; ch. 4 §3.2",
			page: "53, 90"
		}],
		statut: "via_guide"
	}
];
//#endregion
//#region src/moteur/verif-appuis.ts
/** Réactions d'une poutre continue sous charge uniforme q (théorème des trois moments, EI constant). */
function reactionsPoutreContinue(travees, q) {
	const n = travees.length;
	if (n === 1) return [q * (travees[0] ?? 0) / 2, q * (travees[0] ?? 0) / 2];
	const m = n - 1;
	const a = new Array(m).fill(0);
	const b = new Array(m).fill(0);
	const c = new Array(m).fill(0);
	const dd = new Array(m).fill(0);
	for (let i = 1; i <= m; i++) {
		const Li = travees[i - 1] ?? 0;
		const Lj = travees[i] ?? 0;
		a[i - 1] = Li;
		b[i - 1] = 2 * (Li + Lj);
		c[i - 1] = Lj;
		dd[i - 1] = -q * (Li ** 3 + Lj ** 3) / 4;
	}
	for (let i = 1; i < m; i++) {
		const w = (a[i] ?? 0) / (b[i - 1] ?? 1);
		b[i] = (b[i] ?? 0) - w * (c[i - 1] ?? 0);
		dd[i] = (dd[i] ?? 0) - w * (dd[i - 1] ?? 0);
	}
	const M = new Array(m).fill(0);
	M[m - 1] = (dd[m - 1] ?? 0) / (b[m - 1] ?? 1);
	for (let i = m - 2; i >= 0; i--) M[i] = ((dd[i] ?? 0) - (c[i] ?? 0) * (M[i + 1] ?? 0)) / (b[i] ?? 1);
	const Mt = [
		0,
		...M,
		0
	];
	return Array.from({ length: n + 1 }, (_, i) => {
		let R = 0;
		if (i > 0) {
			const L = travees[i - 1] ?? 0;
			R += q * L / 2 + ((Mt[i - 1] ?? 0) - (Mt[i] ?? 0)) / L;
		}
		if (i < n) {
			const L = travees[i] ?? 0;
			R += q * L / 2 + ((Mt[i + 1] ?? 0) - (Mt[i] ?? 0)) / L;
		}
		return R;
	});
}
const vect = (x, y) => Math.hypot(x, y);
function verifierAppuis(p, a, m, r) {
	const d = derives(p);
	const positions = d.positions;
	const criteres = [];
	const lignes = [];
	const lignesRepos = [];
	const lignesJoints = [];
	const { gammaIS, Kf } = p.elastomeres;
	const { retraitFluage, deltaT, alpha } = p.service;
	const kx = m.directions.x.appuis.map((x) => x.kTotal.lbdp);
	const infinis = kx.map((k, i) => k === Infinity ? positions[i] ?? 0 : null).filter((x) => x !== null);
	const x0 = infinis.length ? infinis.reduce((s, x) => s + x, 0) / infinis.length : kx.reduce((s, k, i) => s + k * (positions[i] ?? 0), 0) / Math.max(m.directions.x.K.lbdp, 1e-12);
	const reactionsG = reactionsPoutreContinue(p.tablier.travees, d.poidsLineique.total / 1e3);
	if (!r.vertical.applicable) criteres.push({
		id: "vertical_absent",
		appui: "—",
		libelle: "Séisme vertical non pris en compte dans les appareils (méthode forfaitaire non applicable à cet ouvrage)",
		valeur: 0,
		limite: null,
		unite: "",
		etat: "info",
		commentaire: r.vertical.motif,
		references: ["reactions_verticales", "composante_verticale_a_considerer"]
	});
	const Rv = r.vertical.reactions;
	const appareils = p.appuis.map((appui, i) => {
		const xi = positions[i] ?? 0;
		const distance = Math.abs(xi - x0);
		const dT = alpha * deltaT * distance;
		const dDiff = retraitFluage * distance;
		const rx = r.directions.x.lbdp.appuis[i];
		const ry = r.directions.y.lbdp.appuis[i];
		const dbd = rx?.dAppareils ?? 0;
		const dbdY = ry?.dAppareils ?? 0;
		const cp = appui.chargesPermanentes;
		const permanentes = cp ? {
			...cp,
			source: "saisie"
		} : {
			Nmax: reactionsG[i] ?? 0,
			Nmin: reactionsG[i] ?? 0,
			rotation: 0,
			source: "poutre continue"
		};
		const rv = Rv[i]?.R ?? 0;
		const app = appui.appareils;
		const dEd = gammaIS * dbd + .5 * dT + dDiff;
		const base = {
			id: appui.id,
			type: appui.type,
			elastomere: app.type === "elastomere",
			permanentes,
			service: {
				distance,
				dT,
				dDiff
			},
			dbd,
			dEd,
			combinaisons: []
		};
		lignes.push({
			id: `${appui.id}_service`,
			titre: `${appui.id} — déplacements de service`,
			formule: "d_T = \\alpha\\,\\Delta T\\,|x - x_0|, \\qquad d_{diff} = \\varepsilon_{diff}\\,|x - x_0|",
			application: `${tex(alpha * 1e5, 2)}\\cdot 10^{-5} \\times ${tex(deltaT, 1)} \\times ${tex(distance, 3)}, \\quad ${tex(retraitFluage * 1e4, 2)}\\cdot 10^{-4} \\times ${tex(distance, 3)}`,
			resultat: {
				symbole: "d_T ;\\ d_{diff}",
				valeur: `${nombre(dT * 100, 2)} cm ; ${nombre(dDiff * 100, 2)} cm`
			},
			references: ["deplacements_service"],
			commentaire: `Point fixe x0 = ${nombre(x0, 3)} m (centre des raideurs longitudinales). Charges permanentes : ${permanentes.source === "saisie" ? "calcul de service saisi" : "poutre continue (estimation)"} — Nmax = ${nombre(permanentes.Nmax, 3)} MN, Nmin = ${nombre(permanentes.Nmin, 3)} MN, rotation ${nombre(permanentes.rotation * 1e3, 2)}·10⁻³ rad.`,
			niveau: permanentes.source === "poutre continue" ? "info" : void 0
		});
		if (app.type !== "elastomere") {
			criteres.push({
				id: `${appui.id}_rigides`,
				appui: appui.id,
				libelle: app.type === "fixe" ? "Appareils fixes : dimensionnement en capacité (sur-résistance ≥ 1,3) par le fabricant" : "Appareils glissants : course ≥ déplacement majoré, à justifier par le fabricant",
				valeur: app.type === "fixe" ? 1.3 * Math.max(rx?.F ?? 0, ry?.F ?? 0) : dEd,
				limite: null,
				unite: app.type === "fixe" ? "MN" : "m",
				etat: "info",
				references: ["appareils_fixes"]
			});
			return base;
		}
		const e = app;
		const Tq = epaisseurElastomere(e) ?? 0;
		const ap = e.a - 2 * e.enrobageLateral;
		const bp = e.b - 2 * e.enrobageLateral;
		const Ap = ap * bp;
		const S = Ap / (2 * e.ti * (ap + bp));
		const vx = dT + dDiff;
		const Ar = Ap * (1 - vx / ap);
		const G = m.elastomeres?.Gb ?? 1.1 * e.Gg;
		const EcPrime = 3 * G * (1 + 2 * S * S);
		const sommeTi3 = e.nbFeuillets * e.ti ** 3 + 2 * e.enrobage ** 3;
		const alphaA = permanentes.rotation + .003;
		const epsA = (ap * ap * alphaA + bp * bp * .003) * e.ti / (2 * sommeTi3);
		const n = e.nombre;
		const service = .5 * dT + dDiff;
		const combinaisons = [
			{
				nom: "X + 0,3 Y + 0,3 Z",
				N: (permanentes.Nmax + .3 * rv) / n,
				dEd: vect(gammaIS * dbd + service, .3 * gammaIS * dbdY)
			},
			{
				nom: "0,3 X + Y + 0,3 Z",
				N: (permanentes.Nmax + .3 * rv) / n,
				dEd: vect(.3 * gammaIS * dbd + service, gammaIS * dbdY)
			},
			{
				nom: "0,3 X + 0,3 Y + Z",
				N: (permanentes.Nmax + rv) / n,
				dEd: vect(.3 * gammaIS * dbd + service, .3 * gammaIS * dbdY)
			}
		].map((c) => {
			const epsC = 6 * S * c.N / (Ar * EcPrime);
			const epsQ = c.dEd / Tq;
			return {
				...c,
				epsC,
				epsQ,
				epsA,
				epsT: epsC + epsQ + epsA
			};
		});
		const pire = combinaisons.reduce((x, y) => y.epsT > x.epsT ? y : x);
		const pireQ = combinaisons.reduce((x, y) => y.epsQ > x.epsQ ? y : x);
		const Pcr = 1.3 * G * Ar * ap * S / Tq;
		lignes.push({
			id: `${appui.id}_S`,
			titre: `${appui.id} — coefficient de forme et aire réduite`,
			formule: "S = \\dfrac{a'b'}{2\\,t_i\\,(a' + b')}, \\quad A_r = A'\\left(1 - \\dfrac{v_x}{a'}\\right), \\quad E'_c = 3G(1 + 2S^2)",
			application: `S = \\dfrac{${tex(ap, 3)} \\times ${tex(bp, 3)}}{2 \\times ${tex(e.ti, 3)} \\times ${tex(ap + bp, 3)}}, \\quad A_r = ${tex(Ap, 4)}\\left(1 - \\dfrac{${tex(vx, 4)}}{${tex(ap, 3)}}\\right), \\quad E'_c = 3 \\times ${tex(G, 3)} \\times (1 + 2 \\times ${tex(S, 2)}^2)`,
			resultat: {
				symbole: "S ;\\ A_r ;\\ E'_c",
				valeur: `${nombre(S, 2)} ; ${nombre(Ar, 4)} m² ; ${nombre(EcPrime, 0)} MPa`
			},
			references: ["elastomere_coef_forme", "elastomere_eps_c_E"]
		}, {
			id: `${appui.id}_dEd`,
			titre: `${appui.id} — déplacement total de calcul (longitudinal)`,
			formule: "d_{Ed} = \\gamma_{IS}\\,d_{bd} + 0{,}5\\,d_T + d_{diff}",
			application: `${tex(gammaIS, 2)} \\times ${tex(dbd, 4)} + 0{,}5 \\times ${tex(dT, 4)} + ${tex(dDiff, 4)}`,
			resultat: {
				symbole: "d_{Ed}",
				valeur: dEd,
				unite: "m",
				decimales: 4
			},
			references: ["dEd_appuis", "gamma_IS"],
			commentaire: `dbd = distorsion sismique LBDP des appareils (${nombre(dbd * 100, 2)} cm). Combinaisons : résultante avec la composante transversale.`
		}, {
			id: `${appui.id}_epsT`,
			titre: `${appui.id} — distorsion totale (combinaison ${pire.nom})`,
			formule: "\\varepsilon_{t,d} = K_L\\,(\\varepsilon_{c,E} + \\varepsilon_{q,max} + \\varepsilon_{\\alpha,d}), \\quad \\varepsilon_{c,E} = \\dfrac{6\\,S\\,N_{Ed}}{A_r\\,E'_c}, \\quad \\varepsilon_{q} = \\dfrac{d_{Ed}}{T_q}, \\quad \\varepsilon_{\\alpha,d} = \\dfrac{(a'^2\\alpha_a + b'^2\\alpha_b)\\,t_i}{2\\sum t_i^3}",
			application: `${tex(pire.epsC, 3)} + ${tex(pire.epsQ, 3)} + ${tex(pire.epsA, 3)}`,
			resultat: {
				symbole: "\\varepsilon_{t,d}",
				valeur: pire.epsT,
				decimales: 3
			},
			references: [
				"elastomere_distorsion_totale",
				"elastomere_eps_c_E",
				"elastomere_eps_q_max",
				"elastomere_eps_alpha_d"
			],
			commentaire: `NEd = ${nombre(pire.N * 1e3, 0)} kN par appareil ; αa = ${nombre(alphaA * 1e3, 2)}·10⁻³ rad (rotation permanente + 0,003), αb = 3·10⁻³ rad.`
		});
		const ok = (cond) => cond ? "ok" : "non_verifie";
		criteres.push({
			id: `${appui.id}_epsq`,
			appui: appui.id,
			libelle: `Distorsion de cisaillement εq,max (${pireQ.nom})`,
			valeur: pireQ.epsQ,
			limite: 2,
			unite: "",
			etat: ok(pireQ.epsQ <= 2),
			references: ["elastomere_limites_eps_q", "elastomere_eps_q_max"],
			commentaire: "Limite conseillée 2,0 (NF EN 15129 : 2,5)."
		}, {
			id: `${appui.id}_epst`,
			appui: appui.id,
			libelle: `Distorsion totale εt,d (${pire.nom})`,
			valeur: pire.epsT,
			limite: 7,
			unite: "",
			etat: ok(pire.epsT <= 7),
			references: ["elastomere_distorsion_totale"]
		});
		let flambeOk = true;
		let flambeTexte = "";
		for (const c of combinaisons) {
			const rapport = c.dEd / ap;
			let okC;
			if (c.N < Pcr / 4) okC = rapport <= .7;
			else if (c.N < Pcr / 2) okC = 1 - 2 * c.N / Pcr >= .7 * rapport;
			else okC = false;
			if (!okC) flambeOk = false;
			flambeTexte += `${c.nom} : N = ${nombre(c.N * 1e3, 0)} kN, dEd/a' = ${nombre(rapport, 2)} ; `;
		}
		const Nmax = Math.max(...combinaisons.map((c) => c.N));
		criteres.push({
			id: `${appui.id}_flambement`,
			appui: appui.id,
			libelle: "Flambement : NEd,max < Pcr/4 et dEd/a' ≤ 0,7 (ou critère intermédiaire)",
			valeur: Nmax * 1e3,
			limite: Pcr / 4 * 1e3,
			unite: "kN",
			etat: ok(flambeOk),
			references: ["elastomere_flambement"],
			commentaire: `Pcr = ${nombre(Pcr * 1e3, 0)} kN. ${flambeTexte}`
		});
		lignes.push({
			id: `${appui.id}_Pcr`,
			titre: `${appui.id} — charge critique de flambement`,
			formule: "P_{cr} = \\lambda\\,G\\,A_r\\,\\dfrac{a'\\,S}{T_q}, \\quad \\lambda = 1{,}3",
			application: `1{,}3 \\times ${tex(G, 3)} \\times ${tex(Ar, 4)} \\times \\dfrac{${tex(ap, 3)} \\times ${tex(S, 2)}}{${tex(Tq, 3)}}`,
			resultat: {
				symbole: "P_{cr}",
				valeur: Pcr * 1e3,
				unite: "kN",
				decimales: 0
			},
			references: ["elastomere_flambement"]
		});
		const NminApp = (permanentes.Nmin - .3 * rv) / n;
		const sigmaM = NminApp / Ap;
		const khdyn = (m.directions.x.appuis[i]?.kAppareils.lbdp ?? 0) / n;
		const khstat = e.a * e.b * e.Gg / Tq;
		const F = gammaIS * dbd * khdyn + (.5 * dT + dDiff) * khstat;
		const R = NminApp > 0 ? (.1 + Kf / sigmaM) * NminApp : 0;
		const glisseOk = F <= R;
		criteres.push({
			id: `${appui.id}_glissement`,
			appui: appui.id,
			libelle: "Non-glissement : Fxy,Ed ≤ (0,1 + Kf/σm)·NEd,min",
			valeur: F,
			limite: R,
			unite: "MN",
			etat: glisseOk ? "ok" : e.fixation === "mecanique" ? "info" : "non_verifie",
			references: ["elastomere_glissement", "elastomere_effort_glissement"],
			commentaire: glisseOk ? void 0 : e.fixation === "mecanique" ? "Frottement insuffisant : la fixation mécanique prévue reprend l'effort (taquets ou boulonnage à justifier)." : "Frottement insuffisant : fixation mécanique (anti-cheminement) nécessaire."
		});
		lignes.push({
			id: `${appui.id}_glissement`,
			titre: `${appui.id} — non-glissement`,
			formule: "F_{xy,Ed} = \\gamma_{IS}\\,d_{bd}\\,k_{h,dyn} + (0{,}5\\,d_T + d_{diff})\\,k_{h,stat} \\le \\left(0{,}1 + \\dfrac{K_f}{\\sigma_m}\\right) N_{Ed,min}",
			application: `${tex(gammaIS, 2)} \\times ${tex(dbd, 4)} \\times ${tex(khdyn, 3)} + ${tex(.5 * dT + dDiff, 4)} \\times ${tex(khstat, 3)} = ${tex(F, 3)} \\ \\text{vs}\\ \\left(0{,}1 + \\dfrac{${tex(Kf, 2)}}{${tex(sigmaM, 2)}}\\right) \\times ${tex(NminApp, 3)}`,
			resultat: {
				symbole: "R",
				valeur: R,
				unite: "MN",
				decimales: 3
			},
			references: ["elastomere_glissement", "elastomere_effort_glissement"],
			commentaire: `NEd,min = (Nmin − 0,3 Rv)/n = ${nombre(NminApp * 1e3, 0)} kN ; σm = ${nombre(sigmaM, 2)} MPa${sigmaM < 3 ? " (< 3 MPa)" : ""}.`,
			niveau: glisseOk ? void 0 : "alerte"
		});
		const seuil = Math.max(a.q.longitudinal, a.q.transversal) > 1.5 ? .8 : .5;
		const rapportV = permanentes.Nmin > 0 ? rv / permanentes.Nmin : Infinity;
		criteres.push({
			id: `${appui.id}_soulevement`,
			appui: appui.id,
			libelle: `Réaction verticale sismique / réaction permanente minimale ≤ ${nombre(seuil, 1)} (sinon dispositifs anti-soulèvement)`,
			valeur: rapportV,
			limite: seuil,
			unite: "",
			etat: rapportV <= seuil ? "ok" : "non_verifie",
			references: ["anti_soulevement"],
			commentaire: `Rv = ${nombre(rv, 3)} MN ; Nmin = ${nombre(permanentes.Nmin, 3)} MN. ${permanentes.Nmin - rv > 0 ? "Pas de soulèvement d'appareil (Nmin − Rv > 0)." : "Soulèvement des appareils !"}`
		});
		return {
			...base,
			S,
			Ar,
			EcPrime,
			Pcr,
			combinaisons,
			glissement: {
				F,
				R,
				Nmin: NminApp,
				sigmaM
			}
		};
	});
	const Lg = LG.valeurs[p.site.classeSol];
	const epsE = 2 * a.dg / Lg;
	const repos = [];
	const joints = [];
	const dE = r.directions.x.lbdp.dE;
	[0, p.appuis.length - 1].forEach((i) => {
		const appui = p.appuis[i];
		if (!appui || appui.type !== "culee") return;
		const c = appui;
		const v = appareils[i];
		if (!v) return;
		const Leff = v.service.distance;
		const deg = Math.min(epsE * Leff, 2 * a.dg);
		const des = dE + v.service.dDiff + .5 * v.service.dT;
		const lm = .4;
		const lov = lm + deg + des;
		const disponible = c.excentrementAppui + c.poteaux.cote / 2 + c.sommier.debordAvant + p.tablier.debordAbout;
		repos.push({
			id: c.id,
			lm,
			deg,
			des,
			lov,
			disponible,
			Leff
		});
		criteres.push({
			id: `${c.id}_repos`,
			appui: c.id,
			libelle: "Longueur de repos d'appui : lov = lm + deg + des ≤ recouvrement disponible",
			valeur: lov,
			limite: disponible,
			unite: "m",
			etat: lov <= disponible ? "ok" : "non_verifie",
			references: ["lov_repos_appui", "Lg"]
		});
		lignesRepos.push({
			id: `${c.id}_lov`,
			titre: `${c.id} — longueur minimale de repos d'appui`,
			formule: "l_{ov} = l_m + d_{eg} + d_{es}, \\quad d_{eg} = \\dfrac{2\\,d_g}{L_g}\\,L_{eff} \\le 2\\,d_g, \\quad d_{es} = d_E + d_{diff} + 0{,}5\\,d_T",
			application: `0{,}40 + \\dfrac{2 \\times ${tex(a.dg, 4)}}{${tex(Lg, 0)}} \\times ${tex(Leff, 3)} + (${tex(dE, 4)} + ${tex(v.service.dDiff, 4)} + 0{,}5 \\times ${tex(v.service.dT, 4)})`,
			resultat: {
				symbole: "l_{ov}",
				valeur: lov,
				unite: "m",
				decimales: 3
			},
			references: [
				"lov_repos_appui",
				"Lg",
				"dg"
			],
			commentaire: `Leff = distance au point fixe (aucune liaison rigide). Recouvrement disponible (nu du sommier → extrémité du tablier) : ${nombre(disponible, 2)} m.`
		});
		const souffle = 2 * dE + 2 * v.service.dT + v.service.dDiff;
		const service = v.service.dDiff + .5 * v.service.dT;
		const cat = p.site.categorie;
		const regle = cat === "I" || cat === "II" ? "Catégorie II : séisme pouvant être ignoré pour le joint (about et culée non endommagés)." : dE <= .02 ? "dE ≤ 2 cm : joint dimensionné au séisme ultime." : "dE > 2 cm : souffle = souffle de service + 0,4 × souffle sismique (séisme de service), garde-grève fusible au-delà.";
		const souffleRetenu = cat === "I" || cat === "II" ? 2 * v.service.dT + v.service.dDiff : dE <= .02 ? souffle : 2 * service + .8 * dE;
		const jeuGardeGreve = c.sommier.long - c.poteaux.cote / 2 - c.sommier.debordAvant - c.gardeGreve.retrait - c.gardeGreve.epaisseur - c.excentrementAppui - p.tablier.debordAbout;
		const dEdJoint = dE + v.service.dDiff + .5 * v.service.dT;
		joints.push({
			id: c.id,
			dE,
			dG: v.service.dDiff,
			dT: v.service.dT,
			souffle,
			souffleRetenu,
			regle,
			jeuGardeGreve,
			dEd: dEdJoint
		});
		lignesJoints.push({
			id: `${c.id}_souffle`,
			titre: `${c.id} — souffle sismique total du joint`,
			formule: "\\text{souffle} = 2\\,d_E + 2\\,d_T + d_G",
			application: `2 \\times ${tex(dE * 100, 2)} + 2 \\times ${tex(v.service.dT * 100, 2)} + ${tex(v.service.dDiff * 100, 2)}`,
			resultat: {
				symbole: "\\text{souffle}",
				valeur: souffle * 100,
				unite: "cm",
				decimales: 1
			},
			references: ["souffle_joint", "joints_chaussee"],
			commentaire: `${regle} Souffle retenu : ${nombre(souffleRetenu * 100, 1)} cm.`
		}, {
			id: `${c.id}_jeu`,
			titre: `${c.id} — jeu entre tablier et garde-grève`,
			resultat: {
				symbole: "\\text{jeu}",
				valeur: jeuGardeGreve * 100,
				unite: "cm",
				decimales: 1
			},
			references: ["joints_chaussee", "pE_pT"],
			commentaire: jeuGardeGreve >= dEdJoint ? "Jeu suffisant pour le déplacement sismique de calcul." : `Jeu inférieur au déplacement de calcul (${nombre(dEdJoint * 100, 1)} cm) : choc du tablier sur le garde-grève, à rendre fusible (vérification à l'étape 6c).`,
			niveau: jeuGardeGreve >= dEdJoint ? void 0 : "info"
		});
		criteres.push({
			id: `${c.id}_garde_greve`,
			appui: c.id,
			libelle: "Jeu tablier / garde-grève ≥ déplacement sismique de calcul (sinon garde-grève fusible)",
			valeur: jeuGardeGreve,
			limite: dEdJoint,
			unite: "m",
			etat: jeuGardeGreve >= dEdJoint ? "ok" : "info",
			references: ["joints_chaussee"]
		});
	});
	return {
		appareils,
		criteres,
		repos,
		joints,
		note: [
			{
				id: "appareils",
				titre: "Appareils d'appui",
				lignes
			},
			{
				id: "repos",
				titre: "Repos d'appui",
				lignes: lignesRepos
			},
			{
				id: "joints",
				titre: "Joints et garde-grève",
				lignes: lignesJoints
			}
		]
	};
}
//#endregion
//#region src/moteur/export-efforts.ts
function exporterEfforts(p, a, r, mm) {
	const kN = (v) => v * 1e3;
	if (mm) {
		const T1 = (d) => mm.comparaison.find((c) => c.direction === d)?.T1 ?? 0;
		return {
			format: "pont-ec8-efforts",
			version: 1,
			projet: p.nom,
			unites: {
				force: "kN",
				longueur: "m"
			},
			q: {
				x: a.q.longitudinal,
				y: a.q.transversal
			},
			periodes: {
				x: T1("x"),
				y: T1("y")
			},
			masse: mm.directions.x.lbdp.modele.masse,
			methode: "multimodale",
			appuis: p.appuis.map((ap, i) => {
				const c = mm.combinaisons[i];
				const lx = mm.directions.x.lbdp.appuis[i], ly = mm.directions.y.lbdp.appuis[i];
				return {
					id: ap.id,
					x: lx?.x ?? 0,
					type: ap.type,
					cas: (c?.cas ?? []).map((k) => ({
						nom: k.nom,
						Fx: kN(k.Fx),
						Fy: kN(k.Fy),
						Fz: kN(k.Fz)
					})),
					dTete: {
						x: lx?.dTete ?? 0,
						y: ly?.dTete ?? 0
					},
					dAppareils: {
						x: lx?.dAppareils ?? 0,
						y: ly?.dAppareils ?? 0
					}
				};
			}),
			remarques: [
				"Analyse spectrale multimodale (EN 1998-2 4.2.1) : modes jusqu'à 90 % de la masse, combinaison SRSS ou CQC ; efforts horizontaux transmis par le tablier en tête d'appui, propriétés limites supérieures (UBDP), combinaison des directions 100/30/30 (EN 1998-2 4.2.1.4).",
				"Réactions verticales sismiques issues de l'analyse multimodale verticale (spectre élastique vertical).",
				"Inertie propre des fûts non comprise dans l'effort en tête : elle figure dans l'effort au pied des piles de l'analyse multimodale."
			]
		};
	}
	return {
		format: "pont-ec8-efforts",
		version: 1,
		projet: p.nom,
		unites: {
			force: "kN",
			longueur: "m"
		},
		q: {
			x: a.q.longitudinal,
			y: a.q.transversal
		},
		periodes: {
			x: r.directions.x.lbdp.T,
			y: r.directions.y.lbdp.T
		},
		masse: r.M,
		methode: "mode_fondamental",
		appuis: p.appuis.map((ap, i) => {
			const c = r.combinaisons[i];
			const lx = r.directions.x.lbdp.appuis[i], ly = r.directions.y.lbdp.appuis[i];
			return {
				id: ap.id,
				x: lx?.x ?? 0,
				type: ap.type,
				cas: (c?.cas ?? []).map((k) => ({
					nom: k.nom,
					Fx: kN(k.Fx),
					Fy: kN(k.Fy),
					Fz: kN(k.Fz)
				})),
				dTete: {
					x: lx?.dTete ?? 0,
					y: ly?.dTete ?? 0
				},
				dAppareils: {
					x: lx?.dAppareils ?? 0,
					y: ly?.dAppareils ?? 0
				}
			};
		}),
		remarques: [
			"Efforts horizontaux transmis par le tablier en tête d'appui, propriétés limites supérieures (UBDP), combinaison des directions 100/30/30 (EN 1998-2 4.2.1.4).",
			"Réactions verticales sismiques forfaitaires (guide Cerema 2015) ; nulles si la méthode n'est pas applicable.",
			"Inertie propre des fûts non comprise : à ajouter au pied des appuis si elle n'est pas négligeable."
		]
	};
}
const APPUIS = [
	{
		id: "elastomere_coef_forme",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Coefficient de forme et aire réduite d'un appareil en élastomère",
		latex: "S = \\dfrac{a'\\,b'}{2\\,t_i\\,(a' + b')}, \\qquad A_r = A'\\left(1 - \\dfrac{v_x}{a'} - \\dfrac{v_y}{b'}\\right)",
		variables: [
			{
				symbole: "a',\\,b'",
				description: "dimensions en plan des frettes (a − 2c, b − 2c)",
				unite: "m"
			},
			{
				symbole: "A'",
				description: "aire des frettes a'·b'",
				unite: "m²"
			},
			{
				symbole: "v_x,\\,v_y",
				description: "déplacements dus à la température et aux actions différées",
				unite: "m"
			}
		],
		references: [{
			source: "NF_EN_15129",
			localisation: "8.2.3.3.2",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §4.2",
			page: "256"
		}],
		statut: "via_guide"
	},
	{
		id: "deplacements_service",
		type: "formule",
		etape: "deplacements",
		libelle: "Déplacements de service d'un appui (température, retrait et fluage)",
		latex: "d_T = \\alpha\\,\\Delta T\\,|x - x_0|, \\qquad d_{diff} = \\varepsilon_{diff}\\,|x - x_0|",
		variables: [
			{
				symbole: "x_0",
				description: "point fixe : centre des raideurs longitudinales",
				unite: "m"
			},
			{
				symbole: "\\Delta T",
				description: "variation de température pour les appareils d'appui (EN 1991-1-5, supplément compris)",
				unite: "°C"
			},
			{
				symbole: "\\varepsilon_{diff}",
				description: "raccourcissement relatif dû au retrait et au fluage",
				unite: "-"
			}
		],
		references: [{
			source: "NF_EN_1990",
			localisation: "EN 1991-1-5, 6.1.3.3 (supplément pour appareils d'appui)",
			etat: "a_confirmer"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §1.4 et §4.1",
			page: "243, 256"
		}],
		statut: "via_guide",
		note: "Exemple du guide : ΔT = 42 °C (contraction 32 °C + supplément de 10 °C), εdiff = 4,9·10⁻⁴."
	},
	{
		id: "elastomere_effort_glissement",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Effort horizontal de calcul d'un appareil pour la vérification au glissement",
		latex: "F_{xy,Ed} = \\gamma_{IS}\\,d_{bd}\\,k_{h,dyn} + (0{,}5\\,v_{T} + v_{diff})\\,k_{h,stat}, \\qquad k_{h,stat} = \\dfrac{A\\,G_g}{T_q}",
		variables: [
			{
				symbole: "d_{bd}",
				description: "distorsion sismique de l'appareil (LBDP)",
				unite: "m"
			},
			{
				symbole: "k_{h,dyn}",
				description: "raideur dynamique d'un appareil (LBDP)",
				unite: "MN/m"
			},
			{
				symbole: "N_{Ed,min}",
				description: "effort normal minimal par appareil (séisme vertical ascendant, 0,3 Rv)",
				unite: "MN"
			}
		],
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §4.2",
			page: "258"
		}],
		statut: "via_guide"
	},
	{
		id: "reactions_permanentes",
		type: "regle",
		etape: "verif_appareils_appui",
		libelle: "Réactions et rotations permanentes des appuis",
		enonce: "À reprendre d'un calcul de service (ELS quasi permanent : G + effets différés ± 0,5 T), comme le fait le guide avec CHAMOA-P. À défaut, le moteur estime les réactions par une poutre continue sous la charge permanente uniforme (théorème des trois moments) ; la rotation est alors prise nulle, la rotation minimale de 0,003 rad restant ajoutée.",
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §1.4.4 et §4.1",
			page: "244, 256"
		}],
		statut: "via_guide"
	},
	{
		id: "souffle_joint",
		type: "formule",
		etape: "verif_repos_appui",
		libelle: "Souffle sismique total d'un joint de chaussée",
		latex: "d_{Ed} = d_E + d_G + 0{,}5\\,d_T, \\qquad \\text{souffle} = 2\\,d_E + 2\\,d_T + d_G",
		variables: [
			{
				symbole: "d_E",
				description: "déplacement sismique de calcul du tablier",
				unite: "m"
			},
			{
				symbole: "d_G",
				description: "déplacement différé (retrait et fluage)",
				unite: "m"
			},
			{
				symbole: "d_T",
				description: "déplacement thermique",
				unite: "m"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "2.3.6.3",
			page: "33"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "annexe 1 §8",
			page: "275"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : dEd = dE + dG + ψ2·dT (2.3.6.3(2)P) est conforme ; le souffle 2dE + 2dT + dG est propre au guide (2.3.6.3(5) prévoit plutôt les fractions pE et pT pour les éléments non critiques)."
	},
	{
		id: "dEd_appuis",
		type: "formule",
		etape: "deplacements",
		libelle: "Déplacement total de calcul des organes d'appui",
		latex: "d_{Ed} = \\gamma_{IS}\\,d_E + d_G + \\psi_2\\,d_T + d_{diff}, \\qquad \\psi_2 = 0{,}5",
		variables: [
			{
				symbole: "d_E",
				description: "déplacement sismique de calcul (η·μd·dEe, ou dEe si q = 1)",
				unite: "m"
			},
			{
				symbole: "\\gamma_{IS}",
				description: "coefficient de fiabilité des dispositifs",
				unite: "-"
			},
			{
				symbole: "d_G",
				description: "déplacement dû aux actions permanentes et quasi permanentes",
				unite: "m"
			},
			{
				symbole: "d_T",
				description: "déplacement dû aux actions thermiques",
				unite: "m"
			},
			{
				symbole: "d_{diff}",
				description: "déplacement dû aux déformations différées (retrait, fluage)",
				unite: "m"
			}
		],
		conditions: ["Combiner avec les signes les plus défavorables.", "Ajouter les effets du second ordre s'ils sont significatifs."],
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "6.6.2.2",
				page: "81"
			},
			{
				source: "NF_EN_15129",
				localisation: "8.2.1.2.11(2)",
				etat: "citee_par_guide"
			},
			{
				source: "NF_EN_1990",
				localisation: "annexe A2, tableaux A2.1 à A2.3 (ψ2)",
				etat: "citee_par_guide"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §5.1",
				page: "194"
			}
		],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 6.6.2.2(1)P renvoie à dEd = dE + dG + ψ2·dT (2.7), sans γIS (en EN 1998-2, γIS ne majore que les déplacements des isolateurs, 7.6.2(1)P ; son emploi ici vient de l'EN 15129). Retrait et fluage sont inclus dans dG ; ψ2 = 0,5 vient de l'EN 1990."
	},
	{
		id: "borne_deplacement_elastique",
		type: "regle",
		etape: "deplacements",
		libelle: "Borne des déplacements obtenus avec q",
		enonce: "Les déplacements déduits d'un calcul avec q > 1 restent bornés par ceux du calcul élastique (q = 1).",
		references: [{
			source: "NF_EN_1998_1",
			localisation: "4.3.4(1)P, expression (4.23)",
			page: "54-55"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §1 et §5.1",
			page: "170, 194"
		}],
		statut: "via_guide"
	},
	{
		id: "pE_pT",
		type: "table",
		etape: "deplacements",
		libelle: "Fractions des déplacements sismique et thermique pour les éléments non critiques (joints, murs en retour)",
		symbole: "p_E,\\ p_T",
		unite: "-",
		cles: ["fraction"],
		valeurs: {
			pE: .4,
			pT: .5
		},
		references: [
			{
				source: "NF_EN_1998_2_NA",
				localisation: "2.3.6.3(5)",
				page: "9"
			},
			{
				source: "NF_EN_1998_2",
				localisation: "2.3.6.3(5)",
				page: "33"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §6.1",
				page: "203"
			}
		],
		statut: "via_guide",
		note: "L'AN retient les valeurs recommandées ; leurs valeurs numériques sont reprises du guide."
	},
	{
		id: "gamma_IS",
		type: "table",
		etape: "verif_appareils_appui",
		libelle: "Coefficient de fiabilité des dispositifs (déplacements des systèmes d'isolation)",
		symbole: "\\gamma_{IS}",
		unite: "-",
		cles: ["cas"],
		valeurs: {
			cas_general: 1.5,
			faible_action_ou_butees: 1
		},
		references: [{
			source: "NF_EN_15129",
			localisation: "8.2.1.2.11(2)",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §1 et §5.4.4",
			page: "171, 194"
		}],
		statut: "via_guide",
		note: "γIS = 1,0 pour un élastomère à faible amortissement sous faible action sismique, ou complété par des butées de sécurité. Les appareils en élastomère fretté classiques relèvent de cette famille."
	},
	{
		id: "elastomere_classement",
		type: "regle",
		etape: "verif_appareils_appui",
		libelle: "Élastomères à faible amortissement et faible action sismique",
		enonce: "Faible amortissement : ξ ≤ 0,06 (sinon fort amortissement, justifié selon NF EN 15129 8.2.3.3). Faible action sismique : l'effet du séisme (déplacement ou effort) est inférieur à l'effet total des autres actions de la situation sismique. Élastomère à faible amortissement sous faible action sismique : justification NF EN 1337-3 complétée par NF EN 15129 8.2.1.2.11.",
		references: [{
			source: "NF_EN_15129",
			localisation: "8.2.1.1 et 8.2.3.1",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "195"
		}],
		statut: "via_guide"
	},
	{
		id: "module_G_elastomere",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Module de cisaillement dynamique des élastomères à faible amortissement",
		latex: "G_b = 1{,}1\\,G_g = 1{,}1 \\times 0{,}9 = 1{,}0\\ \\text{MPa}",
		variables: [{
			symbole: "G_g",
			description: "module de cisaillement conventionnel (statique)",
			unite: "MPa"
		}, {
			symbole: "G_b",
			description: "module de cisaillement dynamique nominal",
			unite: "MPa"
		}],
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "7.5.2.4(5)",
				page: "96"
			},
			{
				source: "NF_EN_1337_3",
				localisation: "4.3.1.1",
				etat: "citee_par_guide"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 4 §4.3.4 ; ch. 5 §5.4",
				page: "111, 196"
			}
		],
		statut: "via_guide",
		note: "Valeurs de calcul encadrées par les bornes inférieure (LBDP) et supérieure (UBDP) : voir le modèle."
	},
	{
		id: "elastomere_distorsion_totale",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Distorsion totale d'un appareil en élastomère sous séisme",
		latex: "\\varepsilon_{t,d} = K_L\\,(\\varepsilon_{c,E} + \\varepsilon_{q,max} + \\varepsilon_{\\alpha,d}) \\le \\dfrac{7}{\\gamma_m}, \\qquad \\gamma_m = 1{,}0",
		variables: [
			{
				symbole: "K_L",
				description: "facteur de type de chargement (1,0 usuellement)",
				unite: "-"
			},
			{
				symbole: "\\varepsilon_{c,E}",
				description: "distorsion due à la compression",
				unite: "-"
			},
			{
				symbole: "\\varepsilon_{q,max}",
				description: "distorsion due au déplacement horizontal",
				unite: "-"
			},
			{
				symbole: "\\varepsilon_{\\alpha,d}",
				description: "distorsion due à la rotation",
				unite: "-"
			}
		],
		references: [
			{
				source: "NF_EN_15129",
				localisation: "8.2.3.4.2",
				etat: "citee_par_guide"
			},
			{
				source: "NF_EN_1337_3",
				localisation: "annexe C",
				etat: "citee_par_guide"
			},
			{
				source: "NF_EN_1998_2_NA",
				localisation: "7.6.2(5) : γm = 1,00",
				page: "11"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §5.4",
				page: "196"
			}
		],
		statut: "via_guide"
	},
	{
		id: "elastomere_eps_c_E",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Distorsion due à la compression",
		latex: "\\varepsilon_{c,E} = \\dfrac{6\\,S\\,N_{Ed,max}}{A_r\\,E'_c}, \\qquad E'_c = 3\\,G\\,(1 + 2\\,S^2)",
		variables: [
			{
				symbole: "S",
				description: "coefficient de forme du feuillet le plus épais",
				unite: "-"
			},
			{
				symbole: "N_{Ed,max}",
				description: "effort normal maximal en situation sismique",
				unite: "MN"
			},
			{
				symbole: "A_r",
				description: "surface en plan réduite par le déplacement",
				unite: "m²"
			}
		],
		conditions: ["E'c valable pour les appareils rectangulaires et circulaires (annulaires : voir NF EN 15129)."],
		references: [{
			source: "NF_EN_15129",
			localisation: "8.2.3.1",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "196"
		}],
		statut: "via_guide"
	},
	{
		id: "elastomere_eps_q_max",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Distorsion due au déplacement horizontal",
		latex: "\\varepsilon_{q,max} = \\dfrac{d_{Ed}}{T_q}",
		variables: [{
			symbole: "d_{Ed}",
			description: "déplacement total de calcul (part sismique majorée par γIS)",
			unite: "m"
		}, {
			symbole: "T_q",
			description: "épaisseur totale d'élastomère",
			unite: "m"
		}],
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "196"
		}],
		statut: "via_guide"
	},
	{
		id: "elastomere_eps_alpha_d",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Distorsion due à la rotation",
		latex: "\\varepsilon_{\\alpha,d} = \\dfrac{(a'^2\\,\\alpha_{a,d} + b'^2\\,\\alpha_{b,d})\\,t_i}{2\\,\\sum t_i^3}",
		variables: [
			{
				symbole: "a',\\,b'",
				description: "dimensions effectives en plan",
				unite: "m"
			},
			{
				symbole: "\\alpha_{a,d},\\,\\alpha_{b,d}",
				description: "rotations de calcul (≥ 0,003 rad dans chaque direction)",
				unite: "rad"
			},
			{
				symbole: "t_i",
				description: "épaisseur d'un feuillet d'élastomère",
				unite: "m"
			}
		],
		references: [{
			source: "NF_EN_1337_3",
			localisation: "5.3.3.4",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "196"
		}],
		statut: "via_guide"
	},
	{
		id: "rotation_minimale_elastomere",
		type: "scalaire",
		etape: "verif_appareils_appui",
		libelle: "Rotation de calcul minimale d'un appareil en élastomère, dans chaque direction",
		symbole: "\\alpha_{min}",
		unite: "rad",
		valeur: .003,
		references: [{
			source: "NF_EN_1337_3",
			localisation: "5.3.3.4",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "196"
		}],
		statut: "via_guide"
	},
	{
		id: "elastomere_limites_eps_q",
		type: "table",
		etape: "verif_appareils_appui",
		libelle: "Distorsion horizontale maximale",
		symbole: "\\varepsilon_{q,max}",
		unite: "-",
		cles: ["niveau de séisme"],
		valeurs: {
			service: 1,
			ultime_NF_EN_15129: 2.5,
			ultime_conseille: 2
		},
		references: [
			{
				source: "NF_EN_15129",
				localisation: "8.2.3.4.1",
				etat: "citee_par_guide"
			},
			{
				source: "NF_EN_1998_2",
				localisation: "7.6.2(6)",
				page: "103"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §5.4",
				page: "197"
			}
		],
		statut: "via_guide",
		note: "Le guide conseille de se limiter à 2,0 (valeur de l'EN 1998-2) bien que la NF EN 15129 admette 2,5."
	},
	{
		id: "elastomere_faible_action",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Élastomère à faible amortissement sous faible action sismique",
		latex: "\\varepsilon_{q,d} = \\dfrac{d_{Ed}}{T_q} \\le 2{,}0 \\quad (d_{Ed}\\ \\text{sans}\\ \\gamma_{IS})",
		variables: [{
			symbole: "d_{Ed}",
			description: "déplacement total de calcul, sans coefficient de fiabilité",
			unite: "m"
		}],
		conditions: ["Autres critères : ceux de la NF EN 1337-3 pour les actions non sismiques."],
		references: [{
			source: "NF_EN_15129",
			localisation: "8.2.1.1 et 8.2.1.2.11",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "198"
		}],
		statut: "via_guide"
	},
	{
		id: "elastomere_flambement",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Stabilité au flambement d'un appareil en élastomère",
		latex: "\\begin{cases} \\dfrac{d_{Ed}}{a'} \\le 0{,}7 & N_{Ed,max} < P_{cr}/4 \\\\[6pt] 1 - \\dfrac{2\\,N_{Ed,max}}{P_{cr}} \\ge 0{,}7\\,\\dfrac{d_{Ed}}{a'} & P_{cr}/4 \\le N_{Ed,max} < P_{cr}/2 \\end{cases} \\qquad P_{cr} = \\lambda\\,G\\,A_r\\,\\dfrac{a'\\,S}{T_q}",
		variables: [{
			symbole: "P_{cr}",
			description: "charge critique de flambement (S > 5)",
			unite: "MN"
		}, {
			symbole: "\\lambda",
			description: "1,3 pour un appareil rectangulaire, 1,1 pour un appareil circulaire",
			unite: "-"
		}],
		conditions: ["Dans tous les cas N_Ed,max < Pcr/2.", "Hors élastomères à noyau de plomb."],
		references: [{
			source: "NF_EN_15129",
			localisation: "8.2.3.4",
			etat: "a_confirmer"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "197"
		}],
		statut: "a_verifier",
		note: "La formule imprime S et A_R, le texte parle de S' et Ar : notation à confirmer."
	},
	{
		id: "elastomere_glissement",
		type: "formule",
		etape: "verif_appareils_appui",
		libelle: "Non-glissement d'un appareil en élastomère",
		latex: "F_{xy,d} \\le \\left(0{,}1 + \\dfrac{K_f}{\\sigma_m}\\right) N_{Ed,min}, \\qquad \\sigma_m = \\dfrac{N_{Ed,min}}{A_r} \\ge 3{,}0\\ \\text{MPa}",
		variables: [
			{
				symbole: "F_{xy,d}",
				description: "effort horizontal résultant de calcul",
				unite: "MN"
			},
			{
				symbole: "N_{Ed,min}",
				description: "effort normal minimal (séisme vertical ascendant)",
				unite: "MN"
			},
			{
				symbole: "K_f",
				description: "coefficient de frottement (non chiffré par le guide)",
				unite: "MPa"
			}
		],
		references: [{
			source: "NF_EN_1337_3",
			localisation: "5.3.3.6",
			etat: "a_confirmer"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.4",
			page: "197"
		}],
		statut: "a_verifier",
		note: "Kf à reprendre de la NF EN 1337-3 (de mémoire 0,6 sur béton, 0,2 sur autres surfaces : à confirmer). La NF EN 15129 ne prévoit pas cette vérification."
	},
	{
		id: "anti_soulevement",
		type: "table",
		etape: "verif_appareils_appui",
		libelle: "Seuil de réaction sismique ascendante imposant des dispositifs anti-soulèvement (fraction de la réaction de compression permanente)",
		symbole: "R_{E,v} / R_G",
		unite: "-",
		cles: ["comportement"],
		valeurs: {
			ductile: .8,
			ductilite_limitee: .5
		},
		references: [
			{
				source: "NF_EN_1998_2_NA",
				localisation: "6.6.3.2(1)P",
				page: "10-11"
			},
			{
				source: "NF_EN_1998_2",
				localisation: "6.6.3.2",
				page: "82"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §5.1",
				page: "195"
			}
		],
		statut: "via_guide",
		note: "Aucun soulèvement d'un appareil individuel n'est admis en situation sismique de calcul."
	},
	{
		id: "appareils_fixes",
		type: "regle",
		etape: "verif_appareils_appui",
		libelle: "Appareils d'appui fixes",
		enonce: "Dimensionner en capacité avec une sur-résistance d'au moins 1,3 (approche recommandée : F_C = f(1,3·M_Rd,pile) ≤ F_Rd, soit F_C = 1,3·F_Ed ≤ F_Rd en ductilité limitée), ou à défaut pour q·F_Ed ≤ F_Rd. Sans sur-résistance : attelages sismiques et remplacement aisé.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.5.2 et 6.6.2.1",
			page: "79"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §3.2 et §5.2",
			page: "180, 185, 195"
		}],
		statut: "via_guide"
	},
	{
		id: "lov_repos_appui",
		type: "formule",
		etape: "verif_repos_appui",
		libelle: "Longueur minimale de repos d'appui",
		latex: "l_{ov} = l_m + d_{eg} + d_{es}, \\qquad l_m \\ge 400\\ \\text{mm}, \\qquad d_{eg} = \\varepsilon_e\\,L_{eff} \\le 2\\,d_g, \\quad \\varepsilon_e = \\dfrac{2\\,d_g}{L_g}",
		variables: [
			{
				symbole: "l_m",
				description: "longueur d'appui transmettant la réaction verticale",
				unite: "m"
			},
			{
				symbole: "d_{eg}",
				description: "déplacement relatif dû à la variabilité spatiale du mouvement du sol",
				unite: "m"
			},
			{
				symbole: "d_{es}",
				description: "déplacement sismique du support : dEd, ou dEd + s pour des attelages avec jeu s",
				unite: "m"
			},
			{
				symbole: "L_{eff}",
				description: "distance du joint à la connexion rigide la plus proche (ou au centre d'un groupe de plus de deux piles)",
				unite: "m"
			}
		],
		conditions: [
			"Pont à moins de 5 km d'une faille active de magnitude > 6,5 : doubler deg, sauf étude sismologique.",
			"Joint intermédiaire entre deux tronçons : lov = √(lov,1² + lov,2²).",
			"Appui sur pile intermédiaire : ajouter le déplacement sismique dE en tête de pile."
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.6.4",
			page: "84"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.5",
			page: "199"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 6.6.4(3) (6.12)-(6.15b) conformes ; près d'une faille active (< 5 km, M ≥ 6,5), deg est doublé faute d'étude sismologique spécifique (6.6.4(4))."
	},
	{
		id: "butees",
		type: "regle",
		etape: "verif_repos_appui",
		libelle: "Butées de sécurité et de blocage",
		enonce: "Avec des appareils en élastomère : butées de blocage transversales aux culées (jeu de 1 à 2 cm) et butées de sécurité si la portée dépasse 40 m. Jeu d'une butée de sécurité : d = dG + 0,5·dTh + ddiff + dE. Efforts des butées de sécurité : 75 % de l'effort sismique, ou raideur sécante dont l'énergie vaut 1,5 fois celle au déplacement dEd. Butées de blocage : jeu ≤ 15 mm, dimensionnées en capacité.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "2.3.6.3(4)P (jeu au moins égal à dEd)",
			page: "33"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.6",
			page: "200-202"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 6.6.1 (exigences générales sur les attelages) ne contient ni approche énergétique, ni les valeurs 75 %, 1,5 fois l'énergie, 15 mm, 40 m : ces règles sont du guide. Seul 2.3.6.3(4)P (éléments ductiles ou amortisseurs avec un jeu au moins égal à dEd) s'y rattache."
	},
	{
		id: "attelages_travees_independantes",
		type: "formule",
		etape: "verif_repos_appui",
		libelle: "Effort forfaitaire des attelages entre travées indépendantes",
		latex: "F = 1{,}5\\,a_g\\,S\\,S_T\\,M_d",
		variables: [{
			symbole: "M_d",
			description: "masse de la travée attelée (G non pondéré)",
			unite: "t"
		}],
		conditions: ["En capacité s'ils reprennent tout l'effort sismique."],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.6.3.1",
			page: "82"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §5.7",
			page: "202"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 6.6.3.1(3)P cas (d) : 1,5·ag·S·Md, sans S_T (ajouté par le guide, l'accélération incluant l'amplification topographique) ; Md = masse du tronçon lié, ou la plus faible des deux de part et d'autre du joint, en l'absence d'analyse dynamique."
	},
	{
		id: "joints_chaussee",
		type: "regle",
		etape: "verif_repos_appui",
		libelle: "Joints de chaussée selon la catégorie d'importance",
		enonce: "Catégorie II : le séisme peut être ignoré pour les joints, sans endommager l'about ni la culée. Catégorie III : si |dE| ≤ 2 cm, joints dimensionnés au séisme ultime ; sinon souffle total = souffle de service + 0,4 × souffle sismique (0,2 si une sur-ouverture n'entraîne que des dégâts légers), avec souffle de service = déformations différées + 0,5 × thermique. Catégorie IV : règles de la catégorie III, avec option de joints intacts sous séisme ultime.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "2.3.6.3(5) (pE = 0,4)",
			page: "33"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §6.1",
			page: "203-204"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : seule la valeur recommandée pE = 0,4 (avec pT = 0,5) figure en 2.3.6.3(5) ; la modulation par catégorie, le seuil |dE| ≤ 2 cm et la variante 0,2 viennent du guide."
	}
];
const COMPORTEMENT = [
	{
		id: "eta_k",
		type: "formule",
		etape: "comportement",
		libelle: "Effort normal réduit dans une pile en béton armé",
		latex: "\\eta_k = \\dfrac{N_{Ed}}{A_c\\,f_{ck}}",
		variables: [
			{
				symbole: "N_{Ed}",
				description: "effort normal dans la situation sismique de calcul",
				unite: "MN"
			},
			{
				symbole: "A_c",
				description: "aire de la section brute de béton",
				unite: "m²"
			},
			{
				symbole: "f_{ck}",
				description: "résistance caractéristique du béton en compression",
				unite: "MPa"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "5.3(4), expression (5.2) ; renvoi de 4.1.6(5)P",
			page: "58"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2",
			page: "64"
		}],
		statut: "via_guide"
	},
	{
		id: "q_max",
		type: "table",
		etape: "comportement",
		libelle: "Valeurs maximales du coefficient de comportement q",
		symbole: "q",
		unite: "-",
		cles: ["élément ductile"],
		valeurs: {
			"Piles BA — verticales en flexion": {
				"ductilité limitée": 1.5,
				"ductile (ηk < 0,3)": "3,5 λ(αs)"
			},
			"Piles BA — béquilles inclinées fléchies": {
				"ductilité limitée": 1.2,
				"ductile (ηk < 0,3)": "2,1 λ(αs)"
			},
			"Piles acier — verticales en flexion": {
				"ductilité limitée": 1.5,
				"ductile (ηk < 0,3)": 3.5
			},
			"Piles acier — béquilles inclinées fléchies": {
				"ductilité limitée": 1.2,
				"ductile (ηk < 0,3)": 2
			},
			"Piles acier — contreventement normal": {
				"ductilité limitée": 1.5,
				"ductile (ηk < 0,3)": 2.5
			},
			"Piles acier — contreventement excentré": {
				"ductilité limitée": "—",
				"ductile (ηk < 0,3)": 3.5
			},
			"Culées liées rigidement au tablier — en général": {
				"ductilité limitée": 1.5,
				"ductile (ηk < 0,3)": 1.5
			},
			"Culées liées rigidement — structures bloquées": {
				"ductilité limitée": 1,
				"ductile (ηk < 0,3)": 1
			},
			Arcs: {
				"ductilité limitée": 1.2,
				"ductile (ηk < 0,3)": 2
			}
		},
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6 ; 4.1.6(9) et (10) pour les structures bloquées",
			page: "46"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2, tableau 4",
			page: "65"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : tableau 4.1 en 4.1.6(3)P confirmé, valable pour ηk ≤ 0,30 (4.1.6(5)P)."
	},
	{
		id: "lambda_alpha_s",
		type: "formule",
		etape: "comportement",
		libelle: "Facteur λ(αs) des piles en béton armé",
		latex: "\\alpha_s = \\dfrac{L_s}{h}, \\qquad \\lambda(\\alpha_s) = \\begin{cases} 1{,}0 & \\alpha_s \\ge 3 \\\\ \\sqrt{\\alpha_s / 3} & 1{,}0 \\le \\alpha_s < 3 \\end{cases}",
		variables: [{
			symbole: "L_s",
			description: "distance entre la rotule plastique et la section de moment nul",
			unite: "m"
		}, {
			symbole: "h",
			description: "hauteur de la section dans le plan de flexion",
			unite: "m"
		}],
		conditions: ["Piles rectangulaires à zone comprimée triangulaire : retenir la plus petite valeur de αs des deux directions."],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6",
			page: "46"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2",
			page: "65"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : tableau 4.1 : λ = √(αs/3) pour 3 > αs ≥ 1,0 seulement ; pour αs < 1,0 (pile très trapue), le tableau ne donne pas de valeur et le comportement ductile n'y est pas couvert ; λ = 1,0 pour αs ≥ 3."
	},
	{
		id: "q_reduction_effort_normal",
		type: "formule",
		etape: "comportement",
		libelle: "Réduction de q des piles en béton armé fortement comprimées",
		latex: "q_r = \\begin{cases} q & \\eta_k < 0{,}3 \\\\[4pt] q - \\dfrac{\\eta_k - 0{,}3}{0{,}3}\\,(q - 1) \\ge 1{,}0 & 0{,}3 \\le \\eta_k < 0{,}6 \\\\[4pt] 1{,}0 & \\eta_k \\ge 0{,}6 \\end{cases}",
		variables: [{
			symbole: "\\eta_k",
			description: "effort normal réduit",
			unite: "-"
		}, {
			symbole: "q",
			description: "valeur maximale du tableau pour ηk < 0,3",
			unite: "-"
		}],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6",
			page: "46"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2, tableau 4",
			page: "65"
		}],
		statut: "a_verifier",
		note: "EN 1998-2:2005 : (4.2) qr = q − (ηk − 0,3)/0,3·(q − 1) ≥ 1,0, et qr = 1,0 pour ηk ≥ 0,6 : la forme retenue est celle de l'EN ; le guide a perdu le terme « q − »."
	},
	{
		id: "q_vertical",
		type: "regle",
		etape: "comportement",
		libelle: "Coefficient de comportement vertical",
		enonce: "Pour la composante verticale, q = 1,0 : on utilise le spectre de réponse élastique vertical.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6(12)P",
			page: "47"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5",
			page: "83"
		}],
		statut: "via_guide"
	},
	{
		id: "q_elastomere",
		type: "regle",
		etape: "comportement",
		libelle: "Ponts sur appareils d'appui en élastomère fretté",
		enonce: "Ponts usuels sur élastomère fretté, à piles rigides et légères : comportement quasi élastique, q = 1, avec les dispositions constructives de ductilité limitée.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6(11)P ; 7.3(2)P ; 7.5.1(3) ; 7.6.3(2)",
			page: "47"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2",
			page: "65"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 7.3(2)P et 7.6.3(2) admettent une réponse à ductilité limitée (q ≤ 1,5) des sous-structures ; q = 1 est le choix du guide, repris par l'annexe nationale de 2013 (7.3(2)P) pour les ponts courants à piles rigides sur appareils."
	},
	{
		id: "q_rotules_inaccessibles",
		type: "regle",
		etape: "comportement",
		libelle: "Rotules plastiques non accessibles",
		enonce: "Si les rotules plastiques ne sont pas accessibles pour inspection et réparation, multiplier les valeurs de q « ductile » du tableau 4.1 par 0,6 : q = max(0,6·q ; 1,0).",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6 ; accessibilité : 4.1.6(6) note",
			page: "46"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2 ; ch. 3 §7.1",
			page: "65, 61"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 4.1.6(6) : multiplier les valeurs « ductile » du tableau 4.1 par 0,6, sans qu'il soit nécessaire de descendre sous 1,0, soit q = max(0,6·q ; 1,0) ; la note définit seulement « accessible »."
	},
	{
		id: "q_structures_bloquees",
		type: "regle",
		etape: "comportement",
		libelle: "Structures bloquées",
		enonce: "q = 1,0 pour les structures très raides (période propre T ≤ 0,03 s), dont les tabliers liés rigidement aux deux culées enchâssées dans un sol naturel raide sur au moins 80 % de leur surface latérale ; sinon, si T > 0,03 s, q = 1,5. Cadres et murs de soutènement : q = 1 (guide ; EN 6.7.3(9) et 6.7.5).",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6(9) et (10)",
			page: "47"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2, tableau 4, note 3",
			page: "65"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 4.1.6(9) range aussi dans cette catégorie les culées liées de façon flexible au tablier ; 4.1.6(10) vise le tablier horizontal lié aux deux culées. Les cadres et ouvrages de soutènement sont ajoutés par le guide (culée enterrée à plus de 80 % : 6.7.3(9) ; murs : 6.7.5)."
	},
	{
		id: "q_plusieurs_types",
		type: "regle",
		etape: "comportement",
		libelle: "Plusieurs types d'éléments ductiles dans une direction",
		enonce: "Retenir le q du type d'appuis qui contribue le plus à la résistance au séisme dans la direction considérée.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.6(3)P",
			page: "45"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 2 §2.4 ; ch. 4 §1.2",
			page: "40, 65"
		}],
		statut: "via_guide"
	},
	{
		id: "regularite_rho",
		type: "formule",
		etape: "comportement",
		libelle: "Critère de comportement ductile régulier",
		latex: "r_i = q\\,\\dfrac{M_{Ed,i}}{M_{Rd,i}}, \\qquad \\rho = \\dfrac{r_{max}}{r_{min}} \\le \\rho_0 = 1{,}5",
		variables: [
			{
				symbole: "M_{Ed,i}",
				description: "moment de calcul maximal à la rotule de l'élément ductile i (situation sismique)",
				unite: "MN·m"
			},
			{
				symbole: "M_{Rd,i}",
				description: "moment résistant de calcul de cette section",
				unite: "MN·m"
			},
			{
				symbole: "r_i",
				description: "réduction de q demandée à l'élément i",
				unite: "-"
			}
		],
		conditions: ["Les éléments dont la contribution cumulée à l'effort tranchant sismique total ne dépasse pas 20 % peuvent être exclus du calcul de rmin et rmax."],
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "4.1.8, expression (4.4)",
				page: "48"
			},
			{
				source: "NF_EN_1998_2_NA",
				localisation: "4.1.8(2)",
				page: "10"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 4 §1.2",
				page: "64"
			}
		],
		statut: "via_guide",
		note: "ρ0 = 1,5 en France (valeur recommandée de l'EN : 2,0). Numéro d'expression (4.4) lu dans l'AN."
	},
	{
		id: "q_irregulier",
		type: "formule",
		etape: "comportement",
		libelle: "Coefficient de comportement réduit d'un pont irrégulier",
		latex: "q_r = q\\,\\dfrac{\\rho_0}{\\rho} \\ge 1{,}0",
		variables: [{
			symbole: "\\rho",
			description: "rapport rmax / rmin",
			unite: "-"
		}],
		conditions: ["Alternative : analyse non linéaire."],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "4.1.8(4)P, expression (4.5)",
			page: "48"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §1.2",
			page: "64"
		}],
		statut: "via_guide"
	},
	{
		id: "mu_d",
		type: "formule",
		etape: "deplacements",
		libelle: "Déplacements sismiques de calcul en analyse linéaire avec q",
		latex: "d_E = \\pm\\,\\eta\\,\\mu_d\\,d_{Ee}, \\qquad \\mu_d = \\begin{cases} q & T \\ge T_0 = 1{,}25\\,T_C \\\\[4pt] (q - 1)\\,\\dfrac{T_0}{T} + 1 \\le 5q - 4 & T < T_0 \\end{cases}",
		variables: [
			{
				symbole: "d_{Ee}",
				description: "déplacement obtenu par l'analyse linéaire avec le spectre de calcul",
				unite: "m"
			},
			{
				symbole: "\\eta",
				description: "coefficient de correction de l'amortissement",
				unite: "-"
			},
			{
				symbole: "\\mu_d",
				description: "ductilité en déplacement",
				unite: "-"
			}
		],
		conditions: ["Périodes très faibles (T < 0,033 s) : q = 1, donc μd = 1."],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "2.3.6.1(6)P et 2.3.6.1(8)P",
			page: "32"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5 et §5.8",
			page: "82, 135"
		}],
		statut: "via_guide",
		note: "Le guide énonce la règle en clair ; la forme produit est reconstituée."
	},
	{
		id: "plancher_beta_deplacements",
		type: "regle",
		etape: "deplacements",
		libelle: "Structures très souples touchées par le plancher β·ag",
		enonce: "Tirer les déplacements du spectre élastique ou du spectre en déplacement, et non du spectre de calcul écrêté.",
		references: [{
			source: "NF_EN_1998_1",
			localisation: "4.3.4(1)P, expression (4.23)",
			page: "54-55"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §2.5",
			page: "82"
		}],
		statut: "via_guide"
	}
];
const VERIFICATIONS = [
	{
		id: "gamma_M_sismique",
		type: "table",
		etape: "verif_piles",
		libelle: "Coefficients partiels des matériaux en situation sismique",
		symbole: "\\gamma_M",
		unite: "-",
		cles: ["matériau"],
		valeurs: {
			beton: 1.3,
			armatures_acier: 1,
			elastomere: 1
		},
		references: [{
			source: "NF_EN_1998_1_NA",
			localisation: "5.2.4(3) note 2",
			page: "8"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §1",
			page: "170"
		}],
		statut: "via_guide",
		note: "La clause de l'AN de l'EN 1998-1 vise les bâtiments en béton ; le guide l'étend aux ponts. γm = 1,00 pour l'élastomère : AN de l'EN 1998-2, 7.6.2(5)."
	},
	{
		id: "gamma_Bd1",
		type: "scalaire",
		etape: "verif_piles",
		libelle: "Coefficient de sécurité supplémentaire contre la rupture fragile par effort tranchant (béton)",
		symbole: "\\gamma_{Bd1}",
		unite: "-",
		valeur: 1.25,
		references: [
			{
				source: "NF_EN_1998_2_NA",
				localisation: "5.6.2(2)P b)",
				page: "10"
			},
			{
				source: "NF_EN_1998_2",
				localisation: "5.6.2(2)P",
				page: "61"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §1",
				page: "170"
			}
		],
		statut: "via_guide",
		note: "L'AN retient la valeur recommandée ; valeur numérique reprise du guide."
	},
	{
		id: "gamma_0",
		type: "formule",
		etape: "verif_piles",
		libelle: "Coefficient de sur-résistance pour le dimensionnement en capacité",
		latex: "\\gamma_0 = 1{,}35\\ \\text{(béton)}, \\quad \\gamma_0 = 1{,}25\\ \\text{(acier)}; \\qquad \\eta_k > 0{,}1 : \\ \\gamma_0 \\times \\left[1 + 2\\,(\\eta_k - 0{,}1)^2\\right]",
		variables: [{
			symbole: "\\eta_k",
			description: "effort normal réduit de la rotule en béton armé",
			unite: "-"
		}],
		conditions: ["Ne s'applique ni aux zones de rotules potentielles ni aux seuils des dispositifs élasto-plastiques, frottants ou fusibles."],
		references: [
			{
				source: "NF_EN_1998_2_NA",
				localisation: "5.3(4)",
				page: "10"
			},
			{
				source: "NF_EN_1998_2",
				localisation: "5.3 et 5.3(4)",
				page: "58"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §2.3",
				page: "172-173"
			}
		],
		statut: "via_guide",
		note: "Utilisé en conception ductile (hors V1) et pour les composants dimensionnés en capacité. EN 1998-2:2005 : la majoration 1 + 2(ηk − 0,1)² ne vise que les sections en BA à armatures de confinement conformes à 6.2.1 ; la condition d'exclusion est du guide (5.3(7)P fixe γof = 1,30 pour les appareils glissants)."
	},
	{
		id: "gamma_Rd_dispositifs",
		type: "scalaire",
		etape: "verif_piles",
		libelle: "Sur-résistance des attaches et de la structure liées aux dispositifs (appareils en élastomère compris)",
		symbole: "\\gamma_{Rd}",
		unite: "-",
		valeur: 1.1,
		references: [{
			source: "NF_EN_15129",
			localisation: "4.3.2",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §2.3",
			page: "174"
		}],
		statut: "via_guide"
	},
	{
		id: "flexion_pile_ductilite_limitee",
		type: "formule",
		etape: "verif_piles",
		libelle: "Flexion des piles en conception élastique ou à ductilité limitée",
		latex: "M_{Ed} \\le M_{Rd}\\left(\\dfrac{f_{ck}}{1{,}3}\\,;\\ \\dfrac{f_{yk}}{1{,}0}\\right)",
		variables: [{
			symbole: "M_{Ed}",
			description: "moment de calcul en situation sismique",
			unite: "MN·m"
		}, {
			symbole: "M_{Rd}",
			description: "moment résistant (EC2) avec les coefficients partiels sismiques",
			unite: "MN·m"
		}],
		conditions: ["q ≤ 1,5. Pas de coefficient de surcapacité."],
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "5.6.2(1)P, expression (5.5) ; résistances de calcul : 5.2.2(1)P (renvoi à l'EN 1998-1, 5.2.4)",
				page: "61"
			},
			{
				source: "NF_EN_1992",
				localisation: "flexion composée (EC2)",
				etat: "a_confirmer"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §3.1",
				page: "174"
			}
		],
		statut: "via_guide"
	},
	{
		id: "tranchant_pile_ductilite_limitee",
		type: "formule",
		etape: "verif_piles",
		libelle: "Effort tranchant des piles en conception à ductilité limitée",
		latex: "q\\,V_{Ed} \\le \\dfrac{1}{\\gamma_{Bd1}}\\,V_{Rd}\\left(\\dfrac{f_{ck}}{1{,}3}\\,;\\ \\dfrac{f_{yk}}{1{,}0}\\right), \\qquad \\gamma_{Bd1} = 1{,}25",
		variables: [{
			symbole: "q\\,V_{Ed}",
			description: "effort tranchant dont seule la part sismique est multipliée par q",
			unite: "MN"
		}, {
			symbole: "V_{Rd}",
			description: "résistance à l'effort tranchant (EC2) avec les coefficients partiels sismiques",
			unite: "MN"
		}],
		conditions: ["q ≤ 1,5."],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "5.6.2(2)",
			page: "61"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §3.2",
			page: "174, 180"
		}],
		statut: "via_guide"
	},
	{
		id: "structure_liee_dispositifs",
		type: "formule",
		etape: "verif_piles",
		libelle: "Piles, tablier et fondations liés à des appareils en élastomère ou à des dispositifs",
		latex: "\\gamma_{Rd}\\,M_{Ed}(\\gamma_{IS}) \\le M_{Rd}\\left(\\dfrac{f_{ck}}{1{,}3}\\,;\\ \\dfrac{f_{yk}}{1{,}0}\\right), \\qquad \\gamma_{Rd}\\,V_{Ed}(\\gamma_{IS}) \\le \\dfrac{1}{\\gamma_{Bd1}}\\,V_{Rd}, \\qquad q = 1",
		variables: [{
			symbole: "\\gamma_{Rd}",
			description: "sur-résistance (1,1)",
			unite: "-"
		}, {
			symbole: "M_{Ed}(\\gamma_{IS})",
			description: "moment issu des efforts des dispositifs majorés par γIS",
			unite: "MN·m"
		}],
		references: [
			{
				source: "NF_EN_15129",
				localisation: "4.3.2",
				etat: "citee_par_guide"
			},
			{
				source: "NF_EN_1998_2",
				localisation: "7.5.2.4",
				page: "96"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §3.1, §3.2 et §3.4",
				page: "180-181, 184"
			}
		],
		statut: "via_guide",
		note: "Cas courant des ponts sur appareils en élastomère fretté. EN 1998-2:2005 : 7.5.2.4(3)P (analyse UBDP pour les efforts maximaux) fonde le dimensionnement avec les propriétés majorées ; γIS ne majore que les déplacements des isolateurs (7.6.2(1)P) ; 7.6.3(2) admet q ≤ 1,50 ; γRd = 1,1 vient de l'EN 15129."
	},
	{
		id: "moment_section_circulaire",
		type: "formule",
		etape: "verif_piles",
		libelle: "Moment de calcul d'une pile circulaire (directions combinées)",
		latex: "M_{Ed} = \\sqrt{M_{Ed,long}^2 + (0{,}3\\,M_{Ed,trans})^2}",
		variables: [{
			symbole: "M_{Ed,long},\\,M_{Ed,trans}",
			description: "moments dus au séisme longitudinal et transversal",
			unite: "MN·m"
		}],
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §3.1",
			page: "175"
		}],
		statut: "via_guide"
	},
	{
		id: "combinaison_efforts_pile",
		type: "formule",
		etape: "verif_piles",
		libelle: "Cumul des efforts transmis par le tablier et de l'inertie propre d'une pile",
		latex: "\\text{tablier non fixé : } \\sqrt{S(F_{hp})^2 + S(F_{ht})^2} + 0{,}3\\sqrt{S(F_{vp})^2 + S(F_{vt})^2} \\\\[6pt] \\text{tablier fixé : } \\left[S(F_{hp}) + S(F_{ht})\\right] + 0{,}3\\left[S(F_{vp}) + S(F_{vt})\\right]",
		variables: [{
			symbole: "F_{ht},\\,F_{vt}",
			description: "efforts horizontal et vertical transmis par le tablier",
			unite: "MN"
		}, {
			symbole: "F_{hp},\\,F_{vp}",
			description: "efforts d'inertie propre de la pile",
			unite: "MN"
		}],
		conditions: ["Tablier non fixé : appareils en élastomère ou glissants. Tablier fixé : appareils fixes ou encastrement."],
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §4.2",
			page: "189"
		}],
		statut: "via_guide"
	},
	{
		id: "biais_modere_flexion",
		type: "regle",
		etape: "verif_piles",
		libelle: "Ouvrages courants à biais modéré",
		enonce: "Biais > 78 grades (70°) et piles de forme simple : flexion composée vérifiée dans deux plans perpendiculaires ; sinon flexion composée déviée.",
		references: [{
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §3.2 ; ch. 5 §4.2",
			page: "90, 187"
		}],
		statut: "via_guide"
	},
	{
		id: "kh_kv_culees",
		type: "formule",
		etape: "verif_culees",
		libelle: "Coefficients sismiques des culées et des terres",
		latex: "k_h = \\dfrac{a_g}{g}\\,\\dfrac{S\\,S_T}{r}, \\qquad k_v = \\pm 0{,}5\\,k_h",
		variables: [{
			symbole: "r",
			description: "coefficient lié au déplacement admissible (r = 1 recommandé pour les forces d'inertie)",
			unite: "-"
		}],
		conditions: ["r > 1 admis pour la poussée dynamique des culées à liaison souple si le déplacement est possible avant défaillance : réputé satisfait si le corps de culée est dimensionné pour 1,30·ΔEd (ΔEd = Ed − E0)."],
		references: [{
			source: "NF_EN_1998_5",
			localisation: "7.3.2.2",
			etat: "a_confirmer"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §4.3",
			page: "189-190"
		}],
		statut: "via_guide"
	},
	{
		id: "stabilite_externe_culee",
		type: "formule",
		etape: "verif_culees",
		libelle: "Stabilité externe d'une culée : cumul des efforts",
		latex: "\\left[S(F_{hc}) + S(E_d) + S(F_{he}) + S(F_{ht})\\right] + 0{,}3\\left[S(F_{vc}) + S(F_{ve}) + S(F_{vt})\\right]",
		variables: [
			{
				symbole: "F_{hc},\\,F_{vc}",
				description: "inertie du corps de culée",
				unite: "MN"
			},
			{
				symbole: "E_d",
				description: "poussée dynamique des terres (Mononobe-Okabe)",
				unite: "MN"
			},
			{
				symbole: "F_{he},\\,F_{ve}",
				description: "inertie des terres sur la semelle",
				unite: "MN"
			},
			{
				symbole: "F_{ht},\\,F_{vt}",
				description: "efforts transmis par le tablier (cumulés en phase)",
				unite: "MN"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.7.2",
			page: "85"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 5 §4.3",
			page: "191"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 6.7.2(2) a) à c) et (3) conformes (poussées sismiques des terres, inerties de la culée et du remblai avec ag·S, actions des appareils) ; le cumul + 0,3 × composante verticale relève de la règle générale 4.2.1.4."
	},
	{
		id: "mononobe_okabe",
		type: "formule",
		etape: "verif_culees",
		libelle: "Poussée dynamique des terres (Mononobe-Okabe), état actif",
		latex: "E_d = \\tfrac{1}{2}\\,\\gamma^*\\,(1 \\pm k_v)\\,K\\,H^2 + E_{ws} + E_{wd} \\\\[8pt] K_{ad} = \\dfrac{\\sin^2(\\psi + \\phi_d - \\theta)}{\\cos\\theta\\,\\sin^2\\psi\\,\\sin(\\psi - \\theta - \\delta_{ad})\\left[1 + \\sqrt{\\dfrac{\\sin(\\phi_d + \\delta_{ad})\\,\\sin(\\phi_d - \\beta - \\theta)}{\\sin(\\psi - \\theta - \\delta_{ad})\\,\\sin(\\psi + \\beta)}}\\right]^2}\\quad (\\beta \\le \\phi_d - \\theta) \\\\[8pt] \\tan\\theta = \\dfrac{k_h}{1 \\pm k_v}, \\qquad \\phi_d = \\arctan\\dfrac{\\tan\\phi}{1{,}25}",
		variables: [
			{
				symbole: "\\gamma^*",
				description: "poids volumique du sol (γ si la nappe est sous le mur)",
				unite: "kN/m³"
			},
			{
				symbole: "\\psi",
				description: "inclinaison du parement côté terres sur l'horizontale",
				unite: "°"
			},
			{
				symbole: "\\beta",
				description: "inclinaison du talus",
				unite: "°"
			},
			{
				symbole: "\\delta_{ad}",
				description: "frottement sol-mur de calcul (pris nul en pratique)",
				unite: "°"
			},
			{
				symbole: "E_{ws},\\,E_{wd}",
				description: "poussées statique et hydrodynamique de l'eau",
				unite: "kN/m"
			}
		],
		conditions: [
			"Remblais sans cohésion. Sur-poussée dynamique appliquée à mi-hauteur.",
			"β > φd − θ : Kad = sin²(ψ + φd − θ) / [cos θ · sin²ψ · sin(ψ − θ − δad)].",
			"Nappe au-dessus de la base : γ* et tan θ selon le tableau 24 du guide."
		],
		references: [{
			source: "NF_EN_1998_5",
			localisation: "annexe E",
			etat: "citee_par_guide"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 4 §5.7, tableaux 23 et 24",
			page: "132-134"
		}],
		statut: "via_guide",
		note: "Coefficient r : 1 pour les culées de ponts (tableau 23 du guide)."
	},
	{
		id: "fondations_effets_actions",
		type: "regle",
		etape: "verif_fondations",
		libelle: "Effets des actions sur les fondations",
		enonce: "Conception à ductilité limitée (q ≤ 1,5) : efforts sismiques multipliés par q, soit q·MEd ≤ MRd(fck/1,3 ; fyk/1,0). Conception dissipative : effets de capacité avec sur-résistance, plafonnés aux effets élastiques (q = 1). Vérification préalable de la liquéfaction ; vérifications géotechniques selon l'EC7.",
		references: [
			{
				source: "NF_EN_1998_2",
				localisation: "5.8.1(1)P, 5.8.2(2)P et 5.3(2)",
				page: "71"
			},
			{
				source: "NF_EN_1998_5",
				localisation: "5.3",
				etat: "citee_par_guide"
			},
			{
				source: "GUIDE_CEREMA_2015",
				localisation: "ch. 5 §3.1 et §4.4",
				page: "174, 191"
			}
		],
		statut: "via_guide"
	},
	{
		id: "zones_critiques_ductilite_limitee",
		type: "regle",
		etape: "dispositions_constructives",
		libelle: "Zones critiques en ductilité limitée",
		enonce: "Zone critique là où MRd < 1,3·MEd (MRd ≥ MEd restant imposé) : confinement et anti-flambement requis. Au-delà de 1,3·MEd, aucune disposition particulière.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.5",
			page: "79"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 6 §4.1",
			page: "220"
		}],
		statut: "via_guide"
	},
	{
		id: "confinement_conditions",
		type: "regle",
		etape: "dispositions_constructives",
		libelle: "Confinement requis selon l'effort normal réduit",
		enonce: "ηk ≤ 0,08 : aucun confinement imposé. ηk > 0,08 : confinement si la ductilité en courbure admissible est inférieure à 7 (dispense si elle dépasse 7 avec εcu < 3,5 ‰, ou 2 ‰ pour les sections creuses). Piles creuses avec ηk < 0,20 : confinement non requis si l'anti-flambement est vérifié.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.2.1.1(2)P et 6.2.4",
			page: "72"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 6 §4.3",
			page: "220-221"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : ηk > 0,08 (6.2.1.1(2)P) et dispense si µΦ = 7 atteint avec εcu2 = 0,35 % (6.2.1.1(3)P) conformes ; « 2 ‰ pour les sections creuses » est du guide ; piles creuses : ηk ≤ 0,20 (6.2.4(4)), sous réserve de 6.2.2."
	},
	{
		id: "omega_wd",
		type: "formule",
		etape: "dispositions_constructives",
		libelle: "Rapport mécanique d'armatures de confinement",
		latex: "\\omega_{wd} = \\rho_w\\,\\dfrac{f_{yd}}{f_{cd}}, \\qquad \\rho_w = \\dfrac{A_{sw}}{s_L\\,b}\\ \\text{(rectangulaire)}, \\qquad \\rho_w = \\dfrac{4\\,A_{sp}}{D_{sp}\\,s_L}\\ \\text{(circulaire)}",
		variables: [
			{
				symbole: "A_{sw}",
				description: "section totale des cadres et épingles dans la direction considérée",
				unite: "m²"
			},
			{
				symbole: "s_L",
				description: "espacement longitudinal des armatures transversales",
				unite: "m"
			},
			{
				symbole: "b",
				description: "dimension du noyau perpendiculaire à la direction considérée",
				unite: "m"
			},
			{
				symbole: "A_{sp},\\,D_{sp}",
				description: "section d'une cerce et diamètre de la cerce",
				unite: "m², m"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "éq. (6.3)",
			page: "72"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 6 §4.3",
			page: "221"
		}],
		statut: "via_guide"
	},
	{
		id: "omega_w_req",
		type: "formule",
		etape: "dispositions_constructives",
		libelle: "Confinement requis et confinement minimal",
		latex: "\\omega_{w,req} = \\dfrac{A_c}{A_{cc}}\\,\\lambda\\,\\eta_k + 0{,}13\\,\\dfrac{f_{yd}}{f_{cd}}\\,(\\rho_L - 0{,}01) \\\\[6pt] \\text{rectangulaire : } \\omega_{wd,r} \\ge \\max\\left(\\omega_{w,req}\\,;\\ \\tfrac{2}{3}\\,\\omega_{w,min}\\right), \\qquad \\text{circulaire : } \\omega_{wd,c} \\ge \\max\\left(1{,}4\\,\\omega_{w,req}\\,;\\ \\omega_{w,min}\\right)",
		variables: [
			{
				symbole: "A_{cc}",
				description: "aire du noyau de béton confiné",
				unite: "m²"
			},
			{
				symbole: "\\rho_L",
				description: "pourcentage d'armatures longitudinales",
				unite: "-"
			},
			{
				symbole: "\\lambda,\\,\\omega_{w,min}",
				description: "0,28 et 0,12 en ductilité limitée ; 0,37 et 0,18 en conception ductile",
				unite: "-"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "éq. (6.6), (6.7), (6.8) et tableau 6.1",
			page: "75"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 6 §4.3 et §6",
			page: "221-222, 231"
		}],
		statut: "via_guide"
	},
	{
		id: "anti_flambement",
		type: "formule",
		etape: "dispositions_constructives",
		libelle: "Armatures transversales anti-flambement en zone critique",
		latex: "A_T \\ge \\dfrac{\\sum A_L\\,f_{ys}}{1{,}6\\,f_{yt}}\\,s_T, \\qquad s_L \\le \\delta\\,d_{bL}, \\quad 5 \\le \\delta = 2{,}5\\,\\dfrac{f_{tk}}{f_{yk}} + 2{,}25 \\le 6",
		variables: [
			{
				symbole: "\\sum A_L",
				description: "section des barres longitudinales tenues par l'armature transversale",
				unite: "m²"
			},
			{
				symbole: "s_T",
				description: "espacement transversal des brins",
				unite: "m"
			},
			{
				symbole: "d_{bL}",
				description: "diamètre des barres longitudinales",
				unite: "m"
			}
		],
		references: [{
			source: "NF_EN_1998_2",
			localisation: "éq. (6.9) et (6.10)",
			page: "77"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 6 §4.4",
			page: "222"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : (6.10) est en 6.2.2(4)P ; la référence « 6.5.4.1P » imprimée par le guide n'existe pas (6.5 ne comprend que 6.5.1 et 6.5.2). At et ΣAs en mm², sT en m, ftk/fyk de l'armature transversale."
	},
	{
		id: "dispositions_piles_ductilite_limitee",
		type: "regle",
		etape: "dispositions_constructives",
		libelle: "Piles en ductilité limitée : dispositions des zones critiques",
		enonce: "Armatures longitudinales : φ ≥ 10 mm, classe B, espacement ≤ 200 mm, pas de recouvrement dans les zones critiques (guide : évités ou alternés). Armatures transversales : VRd > q·γBd1·VEd, φ ≥ 10 mm, classe B, sL ≤ δ·dbL, sT ≤ 200 mm. Pieux : q ≥ 1,3 évite en général les zones critiques.",
		references: [{
			source: "NF_EN_1998_2",
			localisation: "6.2.3(3)P (recouvrements)",
			page: "77"
		}, {
			source: "GUIDE_CEREMA_2015",
			localisation: "ch. 6 §4 et §6",
			page: "220, 231"
		}],
		statut: "via_guide",
		note: "EN 1998-2:2005 : 6.2.3(3)P interdit toute jonction par recouvrement ou soudure des armatures longitudinales dans les zones de rotules plastiques (règle des ponts ductiles) ; en ductilité limitée, 6.5.1(4)P n'impose que le confinement (6.2.1.4) et l'anti-flambement (6.2.2). φ ≥ 10 mm, espacement ≤ 200 mm et q ≥ 1,3 pour les pieux sont du guide ; classe B : 5.2.1(2) ; sT ≤ 200 mm : 6.2.1.2(2)P et 6.2.2(3)."
	}
];
//#endregion
//#region src/referentiel/sources.ts
const SOURCES = {
	ARRETE_2011: {
		id: "ARRETE_2011",
		abrege: "Arrêté du 26/10/2011",
		titre: "Arrêté du 26 octobre 2011 relatif à la classification et aux règles de construction parasismique applicables aux ponts de la classe dite « à risque normal »",
		edition: "JO n° 261 du 10 novembre 2011, NOR DEVP1125429A, en vigueur au 1er janvier 2012",
		nature: "reglementaire",
		disponibilite: "public",
		url: "https://aida.ineris.fr/reglementation/arrete-261011-relatif-a-classification-regles-construction-parasismique-applicables",
		remarque: "Articles 1 à 3 et formule ag = γI·agr lus sur la reproduction AIDA (INERIS), qui ne signale aucune modification au 17/10/2026. Les tableaux de l'article 4 n'y figurent pas : leurs valeurs sont reprises du guide Cerema (p. 12-13) et restent à confronter au JO."
	},
	DECRET_2010_1254: {
		id: "DECRET_2010_1254",
		abrege: "Décret 2010-1254",
		titre: "Décret n° 2010-1254 du 22 octobre 2010 relatif à la prévention du risque sismique",
		edition: "Code de l'environnement, art. R. 563-1 à R. 563-8",
		nature: "reglementaire",
		disponibilite: "public"
	},
	DECRET_2010_1255: {
		id: "DECRET_2010_1255",
		abrege: "Décret 2010-1255",
		titre: "Décret n° 2010-1255 du 22 octobre 2010 portant délimitation des zones de sismicité du territoire français",
		edition: "Code de l'environnement, art. D. 563-8-1 (liste des communes, COG Insee au 1er janvier 2008)",
		nature: "reglementaire",
		disponibilite: "public"
	},
	NF_EN_1990: {
		id: "NF_EN_1990",
		abrege: "NF EN 1990",
		titre: "Eurocodes structuraux — Bases de calcul des structures (et annexe A2 : application aux ponts)",
		edition: "NF EN 1990 et NF EN 1990/A1, avec annexes nationales",
		nature: "norme",
		disponibilite: "non_fourni"
	},
	NF_EN_1998_1: {
		id: "NF_EN_1998_1",
		abrege: "NF EN 1998-1",
		titre: "Eurocode 8 — Partie 1 : Règles générales, actions sismiques et règles pour les bâtiments",
		edition: "Septembre 2005 (EN 1998-1:2004)",
		nature: "norme",
		disponibilite: "fourni",
		remarque: "Pages : pagination de l'EN 1998-1:2004 imprimée dans la NF EN 1998-1."
	},
	NF_EN_1998_1_NA: {
		id: "NF_EN_1998_1_NA",
		abrege: "NF EN 1998-1/NA",
		titre: "Annexe nationale à la NF EN 1998-1:2005",
		edition: "Décembre 2007 (P 06-030-1/NA)",
		nature: "annexe_nationale",
		disponibilite: "fourni"
	},
	NF_EN_1998_2: {
		id: "NF_EN_1998_2",
		abrege: "NF EN 1998-2",
		titre: "Eurocode 8 — Partie 2 : Ponts",
		edition: "EN 1998-2:2005 (NF EN 1998-2, décembre 2006) ; lue dans l'édition suisse SN EN 1998-2:2005 (SIA 260.802), version française",
		nature: "norme",
		disponibilite: "fourni",
		remarque: "Texte lu : SN EN 1998-2:2005, reproduction de l'EN 1998-2:2005 en français ; les pages indiquées sont celles de cette édition (la pagination de la NF EN 1998-2 peut différer). L'amendement A1 (2009), cité par le guide Cerema (« EC8-2/A1 »), n'a pas été consulté : ce qui en relève reste pris via le guide. Le projet prEN 1998-2 de juillet 2003 a aussi été lu, en appui seulement."
	},
	NF_EN_1998_2_NA: {
		id: "NF_EN_1998_2_NA",
		abrege: "NF EN 1998-2/NA",
		titre: "Annexe nationale à la NF EN 1998-2:2006 — Ponts",
		edition: "Avril 2013 (P 06-032/NA), remplace l'édition d'octobre 2007",
		nature: "annexe_nationale",
		disponibilite: "fourni"
	},
	NF_EN_1998_5: {
		id: "NF_EN_1998_5",
		abrege: "NF EN 1998-5",
		titre: "Eurocode 8 — Partie 5 : Fondations, ouvrages de soutènement et aspects géotechniques",
		edition: "Septembre 2005, avec annexe nationale",
		nature: "norme",
		disponibilite: "non_fourni"
	},
	NF_EN_1998_5_NA: {
		id: "NF_EN_1998_5_NA",
		abrege: "NF EN 1998-5/NA",
		titre: "Annexe nationale à la NF EN 1998-5:2005 — Fondations, ouvrages de soutènement et aspects géotechniques",
		edition: "Projet soumis à enquête probatoire (pr NF EN 1998-5/NA, P 06-035/NA, septembre 2006)",
		nature: "annexe_nationale",
		disponibilite: "projet",
		remarque: "Texte fourni : le projet d'enquête de 2006, lu (6 pages). Il retient les valeurs recommandées pour 3.1(3), 4.1.4(11) et 5.2(2)P c) et garde les annexes A, D et F informatives ; il est contradictoire sur l'annexe C (AN 1 : annulée et remplacée ; AN 3 : reste informative). Édition homologuée non consultée."
	},
	NF_EN_1337_3: {
		id: "NF_EN_1337_3",
		abrege: "NF EN 1337-3",
		titre: "Appareils d'appui structuraux — Partie 3 : Appareils d'appui en élastomère",
		edition: "2005",
		nature: "norme",
		disponibilite: "non_fourni"
	},
	NF_EN_15129: {
		id: "NF_EN_15129",
		abrege: "NF EN 15129",
		titre: "Dispositifs antisismiques",
		edition: "EN 15129 (édition à préciser)",
		nature: "norme",
		disponibilite: "non_fourni"
	},
	NF_EN_1992: {
		id: "NF_EN_1992",
		abrege: "NF EN 1992",
		titre: "Eurocode 2 — Calcul des structures en béton (parties 1-1 et 2)",
		edition: "NF EN 1992-1-1 et NF EN 1992-2, avec annexes nationales",
		nature: "norme",
		disponibilite: "non_fourni"
	},
	GUIDE_CEREMA_2015: {
		id: "GUIDE_CEREMA_2015",
		abrege: "Guide Cerema 2015",
		titre: "Ponts en zone sismique — Conception et dimensionnement selon l'Eurocode 8 (guide méthodologique)",
		edition: "Cerema, collection Références, 2015, ISBN 978-2-37180-077-9",
		nature: "guide",
		disponibilite: "fourni",
		remarque: "Pages citées = pagination imprimée du livre (page du PDF − 2)."
	}
};
//#endregion
//#region src/referentiel/index.ts
const REFERENTIEL = [
	...NATIONAUX,
	...ACTION,
	...COMPORTEMENT,
	...MODELE,
	...COMBINAISONS,
	...APPUIS,
	...VERIFICATIONS
];
//#endregion
export { REFERENTIEL, SOURCES, actionSismique, analyse, echantillonner as echantillonnerSpectre, exporterEfforts, lireProjet, modele, multimodale, deplacement as spectreDeplacement, valeur as spectreValeur, valider, verifierAppuis };
