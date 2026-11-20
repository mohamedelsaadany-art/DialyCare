/**
 * One short spoken line per lab test when it is high or low. These are medical
 * wording, so every line starts as a DRAFT ("pending") and patients never hear
 * it until a doctor (admin) approves it on the admin "Lab advice" page.
 * The doctor may also edit the text before approving.
 */
export type LabAdviceStatus = 'pending' | 'approved' | 'rejected';

export interface LabAdviceItem {
  text: string;
  status: LabAdviceStatus;
  updatedAt?: string;
  updatedBy?: string;
}

export type LabAdviceMap = Record<string, LabAdviceItem>;

/** key = `${testKey}:high` or `${testKey}:low` */
export const DRAFT_LAB_ADVICE: Record<string, string> = {
  'hemoglobin:low': 'الدم عندك قليل، وده ممكن يخليك تحس بتعب أو نهجان. كمّل حقنة الدم والحديد زي ما الدكتور كاتب.',
  'hemoglobin:high': 'الهيموجلوبين أعلى من المطلوب. الدكتور ممكن يظبط جرعة حقنة الدم.',
  'wbc:low': 'كرات الدم البيضاء قليلة. خلي بالك من النظافة وابعد عن أي حد عنده برد.',
  'wbc:high': 'كرات الدم البيضاء عالية، وده ممكن يكون من التهاب. قول للدكتور لو عندك سخونية أو وجع مكان الفيستيولا أو القسطرة.',
  'platelets:low': 'الصفايح قليلة. لو لاحظت كدمات أو نزيف من اللثة قول للدكتور على طول.',
  'platelets:high': 'الصفايح أعلى من الطبيعي. الدكتور هيتابعها معاك.',
  'calcium:low': 'الكالسيوم قليل. خد الكالسيوم وفيتامين د زي ما الدكتور كاتبهم بالظبط.',
  'calcium:high': 'الكالسيوم عالي. ما تاخدش أي كالسيوم أو فيتامين د زيادة غير اللي الدكتور كاتبه.',
  'phosphorus:low': 'الفسفور أقل من الطبيعي. ما تغيرش جرعة رابط الفسفور لوحدك، الدكتور هو اللي يظبطها.',
  'phosphorus:high': 'الفسفور عالي. قلل الجبن والألبان والمياه الغازية والأكل المحفوظ، وخد رابط الفسفور مع الأكل.',
  'pth:low': 'هرمون الغدة الجار درقية قليل. الدكتور ممكن يغير جرعة فيتامين د.',
  'pth:high': 'هرمون الغدة الجار درقية عالي، وده بيأثر على العضم. التزم بأدوية الفسفور والكالسيوم وفيتامين د.',
  'creatinine:low': 'الكرياتينين أقل من المتوقع، وده ممكن يكون من قلة الأكل. كل بروتين كفاية زي ما الدكتور قال.',
  'creatinine:high': 'الكرياتينين عالي. ما تفوّتش ولا جلسة غسيل، وكمّل الجلسة لآخر وقتها.',
  'urea:low': 'البولينا قليلة، وده ممكن يكون من قلة الأكل. كل بروتين كفاية زي الفراخ والسمك والبيض.',
  'urea:high': 'البولينا عالية. ما تفوّتش جلسات الغسيل، وكمّل الجلسة لآخر وقتها.',
  'serumIron:low': 'الحديد قليل. الدكتور ممكن يديك حقن حديد في الجلسة.',
  'serumIron:high': 'الحديد عالي. الدكتور ممكن يوقف حقن الحديد فترة.',
  'tibc:low': 'نتيجة ربط الحديد أقل من الطبيعي. الدكتور هيتابعها مع باقي تحاليل الحديد.',
  'tibc:high': 'نتيجة ربط الحديد بتقول إن جسمك محتاج حديد. الدكتور هيظبطلك العلاج.',
  'ferritin:low': 'مخزون الحديد قليل. الدكتور ممكن يديك حقن حديد في الجلسة.',
  'ferritin:high': 'مخزون الحديد عالي. الدكتور ممكن يوقف الحديد فترة.',
  'albumin:low': 'الألبومين قليل، يعني جسمك محتاج بروتين أكتر. كل بيض وفراخ وسمك ولحمة باعتدال.',
  'albumin:high': 'الألبومين أعلى من الطبيعي. الدكتور هيتابعه معاك.',
};

export const LAB_ADVICE_KEYS = Object.keys(DRAFT_LAB_ADVICE);

export function isLabAdviceKey(key: unknown): key is string {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(DRAFT_LAB_ADVICE, key);
}

/** Stored decisions on top of the drafts (drafts start as pending). */
export function mergeLabAdvice(stored: LabAdviceMap | null | undefined): LabAdviceMap {
  const out: LabAdviceMap = {};
  for (const key of LAB_ADVICE_KEYS) {
    const s = stored?.[key];
    out[key] = s && typeof s.text === 'string' ? { ...s } : { text: DRAFT_LAB_ADVICE[key], status: 'pending' };
  }
  return out;
}

/**
 * What a patient hears. No approval needed any more (owner's decision,
 * 20 Nov 2026): every line is spoken unless the super admin refused it.
 */
export function approvedLabAdvice(all: LabAdviceMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(all)) if (v.status !== 'rejected' && v.text.trim()) out[k] = v.text.trim();
  return out;
}
