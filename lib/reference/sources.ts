// Design Ref: §3 참고값 자료 파일 — 모든 참고값은 출처와 함께 한곳에서 관리한다
// PLAN 작업 2: 참고값의 출처 목록과, 참고값 하나를 담는 공통 모양을 정한다.
// 숫자는 공개 연구에서 직접 확인한 것만 넣는다. 원문을 열어 보지 못하고
// 다른 논문의 인용으로만 확인한 값은 verifiedPrimary: false로 표시한다.

/** 출처 하나 */
export interface Source {
  id: string;
  /** 저자, 연도, 제목, 학술지 */
  citation: string;
  doi?: string;
  url?: string;
}

/** 값의 믿을 만한 정도 */
export type Confidence = "high" | "medium" | "low";

/** 참고값 하나. 범위 값은 [최소, 최대]로 담는다 */
export interface RefValue {
  value: number | [number, number];
  unit: string;
  sourceIds: string[];
  confidence: Confidence;
  /** 원 논문을 직접 열어 확인했으면 true, 리뷰·인용으로만 확인했으면 false */
  verifiedPrimary: boolean;
  /** 측정 조건이나 해석할 때 주의할 점 */
  note?: string;
}

export const SOURCES: Record<string, Source> = {
  deleva1996: {
    id: "deleva1996",
    citation:
      "de Leva P (1996). Adjustments to Zatsiorsky-Seluyanov's segment inertia parameters. J Biomech 29(9):1223–1230.",
    doi: "10.1016/0021-9290(95)00178-6",
  },
  walilko2005: {
    id: "walilko2005",
    citation:
      "Walilko TJ, Viano DC, Bir CA (2005). Biomechanics of the head for Olympic boxer punches to the face. Br J Sports Med 39:710–719.",
    doi: "10.1136/bjsm.2004.014126",
  },
  adamec2021: {
    id: "adamec2021",
    citation:
      "Adamec J et al. (2021). Biomechanical assessment of various punching techniques. Int J Legal Med 135:853–859.",
    doi: "10.1007/s00414-020-02440-8",
  },
  mosler2024: {
    id: "mosler2024",
    citation: "Mosler D, Kacprzak J, Wąsik J (2024). Applied Sciences 14(17):7785.",
    doi: "10.3390/app14177785",
  },
  kacprzak2025: {
    id: "kacprzak2025",
    citation:
      "Kacprzak J, Mosler D, Tsos A, Wąsik J (2025). Biomechanics of Punching. Applied Sciences 15(7):4008.",
    doi: "10.3390/app15074008",
  },
  gora2025: {
    id: "gora2025",
    citation:
      "Góra T, Wąsik J, Mosler D, Ortenburger D (2025). Acta of Bioengineering and Biomechanics 27(1):203–209.",
    doi: "10.37190/abb-02592-2025-02",
  },
  gora2024: {
    id: "gora2024",
    citation: "Góra T et al. (2024). Applied Sciences 14(6):2339.",
    doi: "10.3390/app14062339",
  },
  wasik2023: {
    id: "wasik2023",
    citation:
      "Wąsik J, Mosler D, Góra T, Scurek R (2023). Physical Activity Review 11:11–16.",
    doi: "10.16926/par.2023.11.02",
  },
  smith2000: {
    id: "smith2000",
    citation:
      "Smith MS, Dyson RJ, Hale T, Janaway L (2000). Development of a boxing dynamometer and its punch force discrimination efficacy. J Sports Sci 18:445–450.",
    doi: "10.1080/02640410050074377",
  },
  piorkowski2011: {
    id: "piorkowski2011",
    citation:
      "Piorkowski BA, Lees A, Barton GJ (2011). Single maximal versus combination punch kinematics. Sports Biomechanics 10(1):1–11.",
    doi: "10.1080/14763141.2010.547590",
  },
  atha1985: {
    id: "atha1985",
    citation:
      "Atha J, Yeadon MR, Sandover J, Parsons KC (1985). The damaging punch. BMJ 291:1756–1757.",
    doi: "10.1136/bmj.291.6511.1756",
  },
  osullivan2009: {
    id: "osullivan2009",
    citation:
      "O'Sullivan D et al. (2009). Measurement and comparison of Taekwondo and Yongmudo turning kick impact force. J Sports Sci Med 8(CSSI3):13–16.",
    url: "https://pubmed.ncbi.nlm.nih.gov/24474880/",
  },
  corcoran2024: {
    id: "corcoran2024",
    citation:
      "Corcoran D, Climstein M, Whitting J, Del Vecchio L (2024). Impact Force and Velocities for Kicking Strikes in Combat Sports: A Literature Review. Sports (Basel) 12(3):74.",
    doi: "10.3390/sports12030074",
  },
  pierce2006: {
    id: "pierce2006",
    citation:
      "Pierce JD et al. (2006). Direct measurement of punch force during six professional boxing matches. J Quant Anal Sports 2(2). (corcoran2024 리뷰의 인용으로 확인)",
    doi: "10.2202/1559-0410.1004",
  },
  pedzich2006: {
    id: "pedzich2006",
    citation:
      "Pędzich W, Mastalerz A, Urbanik C (2006). Acta of Bioengineering and Biomechanics 8:83–90. (corcoran2024 리뷰의 인용으로 확인)",
  },
  nakano2009: {
    id: "nakano2009",
    citation:
      "Nakano G, Iino Y, Kojima T (2009). Influences of the mass of boxing gloves on the impact force of a rear hand straight punch. ISBS Conference Proceedings 27.",
    url: "https://ojs.ub.uni-konstanz.de/cpa/article/view/3427",
  },
  leemcgill2014: {
    id: "leemcgill2014",
    citation:
      "Lee B, McGill S (2014). Revista de Artes Marciales Asiáticas 9(2):106–115. (MMA 글러브와 복싱 글러브의 충격 비교)",
    doi: "10.18002/rama.v9i2.1175",
  },
  bartsch2012: {
    id: "bartsch2012",
    citation:
      "Bartsch AJ et al. (2012). Boxing and mixed martial arts: preliminary traumatic neuromechanical injury risk analyses from laboratory impact dosage data. J Neurosurg 116:1070–1080.",
    doi: "10.3171/2011.12.JNS111478",
  },
  cormier2010: {
    id: "cormier2010",
    citation:
      "Cormier J, Manoogian S, Bisplinghoff J, Rowson S, Santago A, McNally C, Duma S, Bolte J (2010). The Tolerance of the Nasal Bone to Blunt Impact. Ann Adv Automot Med 54:3–14.",
    url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3242551/",
  },
  bass2015: {
    id: "bass2015",
    citation:
      "Bass CR, Yoganandan N (2015). Skull and Facial Bone Injury Biomechanics. In: Accidental Injury, 3rd ed., Springer, Ch. 8 (Table 8.1: Nahum 1968/1975, Schneider & Nahum 1972, Allsop 1988, Nyquist 1986 정리).",
    doi: "10.1007/978-1-4939-1732-7_8",
  },
  king2003: {
    id: "king2003",
    citation:
      "King AI, Yang KH, Zhang L, Hardy W, Viano DC (2003). Is Head Injury Caused by Linear or Angular Acceleration? IRCOBI Conference, Lisbon.",
    url: "https://www.smf.org/docs/articles/hic/King_IRCOBI_2003.pdf",
  },
  pellman2003: {
    id: "pellman2003",
    citation:
      "Pellman EJ, Viano DC, Tucker AM, Casson IR, Waeckerle JF (2003). Concussion in professional football: reconstruction of game impacts and injuries. Neurosurgery 53:799–814.",
    doi: "10.1093/neurosurgery/53.3.799",
  },
  viano2007: {
    id: "viano2007",
    citation:
      "Viano DC, Casson IR, Pellman EJ (2007). Concussion in professional football: biomechanics of the struck player. Neurosurgery 61:313–328.",
    doi: "10.1227/01.NEU.0000279969.02685.D0",
  },
  vianoLateral1989: {
    id: "vianoLateral1989",
    citation:
      "Viano DC, Lau IV, Asbury C, King AI, Begeman P (1989). Biomechanics of the human chest, abdomen, and pelvis in lateral impact. Accid Anal Prev 21:553–574.",
    doi: "10.1016/0001-4575(89)90070-5",
  },
  lauViano1986: {
    id: "lauViano1986",
    citation:
      "Lau IV, Viano DC (1986). The Viscous Criterion — Bases and Applications of an Injury Severity Index for Soft Tissues. SAE 861882.",
  },
  yoganandan2007: {
    id: "yoganandan2007",
    citation:
      "Yoganandan N, Pintar FA, Stemper BD et al. (2007). Biomechanics of side impact: injury criteria, aging occupants, and airbag technology. J Biomech 40(2):227–243. (Viano 1989 SAE 892432, Cavanaugh 1993의 옆 충격 힘 기준을 정리)",
    doi: "10.1016/j.jbiomech.2006.01.002",
  },
  kirkish1996: {
    id: "kirkish1996",
    citation:
      "Kirkish SL, Begeman PC, Paravasthu NS (1996). Proposed Provisional Reference Values for the Humerus for Evaluation of Injury Potential. 40th Stapp Car Crash Conference.",
    doi: "10.4271/962416",
  },
  santago2008: {
    id: "santago2008",
    citation:
      "Santago AC, Cormier JM, Duma SM (2008). Humerus fracture bending risk function for the 50th percentile male. Biomed Sci Instrum 44:231–236.",
    url: "https://pubmed.ncbi.nlm.nih.gov/19141921/",
  },
  duma1999: {
    id: "duma1999",
    citation:
      "Duma SM, Schreiber PH, McMaster JD, Crandall JR, Bass CR, Pilkey WD (1999). Dynamic injury tolerances for long bones of the female upper extremity. J Anat 194:463–471.",
    doi: "10.1046/j.1469-7580.1999.19430463.x",
  },
  pintar1998: {
    id: "pintar1998",
    citation:
      "Pintar FA, Yoganandan N, Eppinger RH (1998). Response and Tolerance of the Human Forearm to Impact Loading. Stapp Car Crash Conference, SAE 983149.",
  },
  nyquist1985: {
    id: "nyquist1985",
    citation:
      "Nyquist GW, Cheng R, El-Bohy AAR, King AI (1985). Tibia Bending: Strength and Response. SAE 851728.",
  },
  kennedy2004: {
    id: "kennedy2004",
    citation:
      "Kennedy EA et al. (2004). Lateral and posterior dynamic bending of the mid-shaft femur. Stapp Car Crash Journal 48:27–51.",
    doi: "10.4271/2004-22-0002",
  },
};
