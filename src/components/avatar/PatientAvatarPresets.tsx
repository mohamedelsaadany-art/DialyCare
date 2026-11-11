'use client';

import React from 'react';

export type Gender = 'male' | 'female';
export type MedicalAccessory = 'av_fistula_arm' | 'permcath_chest';
export type AgeGroup = 'young' | 'mature' | 'elder';

export interface AvatarPreset {
  id: string;
  nameEn: string;
  nameAr: string;
  gender: Gender;
  descriptionEn: string;
  descriptionAr: string;
  medicalAccessory: MedicalAccessory;
  ageGroup: AgeGroup;
  themeColor: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  // ---------------- MALE PRESETS ----------------
  {
    id: 'male_mature_1',
    nameEn: 'Ahmed (Classic)',
    nameAr: 'أحمد (كلاسيكي)',
    gender: 'male',
    descriptionEn: 'Mature gentleman with neat dark hair, friendly glasses, and AV fistula access bandage.',
    descriptionAr: 'رجل وقور بشعر داكن مرتب ونظارة طبية مبتسمة مع رباط ناسور شرياني (فيستولا).',
    medicalAccessory: 'av_fistula_arm',
    ageGroup: 'mature',
    themeColor: '#1e6bb8',
  },
  {
    id: 'male_mature_2',
    nameEn: 'Tarek (Modern Polo)',
    nameAr: 'طارق (عصري بلحية خفيفة)',
    gender: 'male',
    descriptionEn: 'Middle-aged man with trimmed beard, navy polo, and vascular access support.',
    descriptionAr: 'رجل في منتصف العمر بلحية مشذبة وقميص أزرق داكن ورعاية كاملة للناسور.',
    medicalAccessory: 'av_fistula_arm',
    ageGroup: 'mature',
    themeColor: '#0d9488',
  },
  {
    id: 'male_elder_1',
    nameEn: 'Mahmoud (Silver Elder)',
    nameAr: 'محمود (جد وقور بشعر فضي)',
    gender: 'male',
    descriptionEn: 'Dignified senior gentleman with silver hair, comforting smile, and permcath dressing.',
    descriptionAr: 'جد وقور بشعر فضي وابتسامة مطمئنة مع غيار قسطرة الغسيل المستديمة (بيرمكاث).',
    medicalAccessory: 'permcath_chest',
    ageGroup: 'elder',
    themeColor: '#4f46e5',
  },
  {
    id: 'male_young_1',
    nameEn: 'Omar (Active)',
    nameAr: 'عمر (شاب نشط ورياضي)',
    gender: 'male',
    descriptionEn: 'Energetic young adult in comfortable athletic wear with protected fistula arm.',
    descriptionAr: 'شاب نشط ومبتسم بملابس رياضية مريحة مع حماية ذراع الغسيل الكلوي.',
    medicalAccessory: 'av_fistula_arm',
    ageGroup: 'young',
    themeColor: '#ea580c',
  },

  // ---------------- FEMALE PRESETS ----------------
  {
    id: 'female_mature_1',
    nameEn: 'Fatima (Teal Hijab)',
    nameAr: 'فاطمة (حجاب زمردي)',
    gender: 'female',
    descriptionEn: 'Mature woman with elegant teal hijab, warm kind expression, and access care bandage.',
    descriptionAr: 'سيدة وقورة بحجاب زمردي أنيق وابتسامة دافئة مع رعاية ناسور الذراع.',
    medicalAccessory: 'av_fistula_arm',
    ageGroup: 'mature',
    themeColor: '#0f766e',
  },
  {
    id: 'female_mature_2',
    nameEn: 'Maryam (Rose Scarf)',
    nameAr: 'مريم (طرحة وردية)',
    gender: 'female',
    descriptionEn: 'Gentle woman in soft rose scarf, calming eyes, and permcath catheter protection.',
    descriptionAr: 'سيدة طيبة الملامح بطرحة وردية هادئة وغيار آمن لقسطرة الصدر.',
    medicalAccessory: 'permcath_chest',
    ageGroup: 'mature',
    themeColor: '#e11d48',
  },
  {
    id: 'female_elder_1',
    nameEn: 'Zeinab (Traditional White)',
    nameAr: 'زينب (أم وجدة بحجاب أبيض)',
    gender: 'female',
    descriptionEn: 'Grandmotherly senior lady with traditional white veil, soothing smile, and fistula support.',
    descriptionAr: 'جدة حنونة بحجاب أبيض ناصع وابتسامة مريحة مع ضمادة ناسور شرياني آمنة.',
    medicalAccessory: 'av_fistula_arm',
    ageGroup: 'elder',
    themeColor: '#2563eb',
  },
  {
    id: 'female_young_1',
    nameEn: 'Salma (Lavender Scarf)',
    nameAr: 'سلمى (عصرية بوشاح لافندر)',
    gender: 'female',
    descriptionEn: 'Young cheerful lady with modern lavender scarf, upbeat energy, and protected access.',
    descriptionAr: 'شابة مشرقة ومبتسمة بحجاب بنفسجي حديث ومعنويات إيجابية للعلاج.',
    medicalAccessory: 'av_fistula_arm',
    ageGroup: 'young',
    themeColor: '#7c3aed',
  },
];

export function getAvatarPreset(presetId?: string, gender?: string): AvatarPreset {
  if (presetId) {
    const found = AVATAR_PRESETS.find((p) => p.id === presetId);
    if (found) return found;
  }
  if (gender === 'female') {
    return AVATAR_PRESETS.find((p) => p.id === 'female_mature_1') || AVATAR_PRESETS[4];
  }
  return AVATAR_PRESETS.find((p) => p.id === 'male_mature_1') || AVATAR_PRESETS[0];
}

interface PatientAvatarSvgProps {
  presetId?: string;
  className?: string;
  gender?: string;
}

export function PatientAvatarSvg({ presetId, className = 'w-full h-full', gender }: PatientAvatarSvgProps) {
  const preset = getAvatarPreset(presetId, gender);

  switch (preset.id) {
    // ----------------------------------------------------
    // 1. Ahmed (Classic Male): Glasses, dark hair, AV fistula arm
    // ----------------------------------------------------
    case 'male_mature_1':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          {/* Background circular glow */}
          <circle cx="50" cy="50" r="48" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="2.5" />

          {/* Shoulders / Torso with Teal-Blue Scrub/Polo */}
          <path d="M20 90C20 74 32 66 50 66C68 66 80 74 80 90" fill="#1e6bb8" />
          <path d="M43 66L50 78L57 66" fill="#fbcfe8" opacity="0.2" />
          <path d="M50 78V90" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />

          {/* Clinical Attribute: AV Fistula Bandage on Forearm/Arm (Right visual side) */}
          <rect x="70" y="74" width="16" height="12" rx="4" fill="#ffffff" stroke="#0284c7" strokeWidth="1.8" />
          <path d="M73 78H83" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M78 75V81" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="83" cy="83" r="2" fill="#10b981" />

          {/* Neck */}
          <rect x="44" y="54" width="12" height="15" rx="3" fill="#f5d0b5" />

          {/* Head & Ears */}
          <circle cx="32" cy="42" r="5" fill="#f5d0b5" stroke="#d49b78" strokeWidth="1" />
          <circle cx="68" cy="42" r="5" fill="#f5d0b5" stroke="#d49b78" strokeWidth="1" />
          <ellipse cx="50" cy="42" rx="19" ry="21" fill="#fcd9bd" />

          {/* Dark Neat Hair */}
          <path
            d="M31 38C31 24 40 18 50 18C60 18 69 24 69 38C69 32 66 26 59 25C52 24 48 27 42 25C36 24 33 30 31 38Z"
            fill="#1e293b"
          />

          {/* Glasses Frame & Lenses */}
          <rect x="35" y="36" width="12" height="9" rx="3" fill="#ffffff" fillOpacity="0.4" stroke="#0f172a" strokeWidth="2" />
          <rect x="53" y="36" width="12" height="9" rx="3" fill="#ffffff" fillOpacity="0.4" stroke="#0f172a" strokeWidth="2" />
          <path d="M47 40H53" stroke="#0f172a" strokeWidth="2" />
          <path d="M35 39H30" stroke="#0f172a" strokeWidth="1.8" />
          <path d="M65 39H70" stroke="#0f172a" strokeWidth="1.8" />

          {/* Eyes behind lenses */}
          <circle cx="41" cy="40.5" r="2" fill="#0f172a" />
          <circle cx="59" cy="40.5" r="2" fill="#0f172a" />

          {/* Eyebrows */}
          <path d="M36 33C38 31 43 32 45 33" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
          <path d="M55 33C57 32 62 31 64 33" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />

          {/* Nose & Friendly Smile */}
          <path d="M50 42V47L48 48" stroke="#d49b78" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M43 51C45 55 55 55 57 51" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" fill="#ffffff" />
          <circle cx="38" cy="48" r="2.5" fill="#f43f5e" opacity="0.3" />
          <circle cx="62" cy="48" r="2.5" fill="#f43f5e" opacity="0.3" />
        </svg>
      );

    // ----------------------------------------------------
    // 2. Tarek (Modern Male): Short beard, healthcare polo, AV fistula
    // ----------------------------------------------------
    case 'male_mature_2':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#ccfbf1" stroke="#14b8a6" strokeWidth="2.5" />

          {/* Torso: Emerald-Teal Polo */}
          <path d="M20 90C20 74 32 66 50 66C68 66 80 74 80 90" fill="#0d9488" />
          <path d="M42 66L50 77L58 66" fill="#ffffff" opacity="0.25" />
          <circle cx="50" cy="80" r="1.5" fill="#ffffff" />
          <circle cx="50" cy="85" r="1.5" fill="#ffffff" />

          {/* Clinical Attribute: AV Fistula Bandage on Left visual side */}
          <rect x="14" y="74" width="16" height="12" rx="4" fill="#ffffff" stroke="#0f766e" strokeWidth="1.8" />
          <path d="M17 80H27" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M22 76V84" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />

          {/* Neck */}
          <rect x="44" y="54" width="12" height="15" rx="3" fill="#e2b79a" />

          {/* Ears & Head */}
          <circle cx="31" cy="43" r="5" fill="#e2b79a" />
          <circle cx="69" cy="43" r="5" fill="#e2b79a" />
          <ellipse cx="50" cy="43" rx="19" ry="21" fill="#f0c6aa" />

          {/* Modern Crop Hair */}
          <path d="M31 38C31 23 41 18 50 18C60 18 69 23 69 38C67 27 60 23 50 23C40 23 33 27 31 38Z" fill="#292524" />

          {/* Eyes */}
          <ellipse cx="42" cy="40" rx="2.5" ry="3" fill="#1c1917" />
          <circle cx="43" cy="39" r="1" fill="#ffffff" />
          <ellipse cx="58" cy="40" rx="2.5" ry="3" fill="#1c1917" />
          <circle cx="59" cy="39" r="1" fill="#ffffff" />

          {/* Eyebrows */}
          <path d="M37 34C40 33 44 34 46 35" stroke="#292524" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M54 35C56 34 60 33 63 34" stroke="#292524" strokeWidth="2.5" strokeLinecap="round" />

          {/* Nose */}
          <path d="M50 42V47H48" stroke="#c99573" strokeWidth="1.8" strokeLinecap="round" />

          {/* Trimmed Neat Beard & Smile */}
          <path
            d="M36 46C37 57 44 63 50 63C56 63 63 57 64 46C61 49 57 50 50 50C43 50 39 49 36 46Z"
            fill="#44403c"
            opacity="0.85"
          />
          <path d="M44 52C46 56 54 56 56 52" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    // ----------------------------------------------------
    // 3. Mahmoud (Silver Elder): Senior gentleman, permcath chest dressing
    // ----------------------------------------------------
    case 'male_elder_1':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#e0e7ff" stroke="#6366f1" strokeWidth="2.5" />

          {/* Torso: Indigo Cardigan */}
          <path d="M20 90C20 74 32 66 50 66C68 66 80 74 80 90" fill="#4338ca" />
          <path d="M42 66L50 78L58 66" fill="#f8fafc" />

          {/* Clinical Attribute: Permcath Dual-Lumen Chest Dressing on Right Clavicle/Chest */}
          <rect x="56" y="69" width="16" height="14" rx="3" fill="#ffffff" stroke="#4f46e5" strokeWidth="1.5" />
          <line x1="60" y1="73" x2="68" y2="73" stroke="#94a3b8" strokeWidth="1" />
          <circle cx="61" cy="79" r="2" fill="#ef4444" />
          <circle cx="67" cy="79" r="2" fill="#3b82f6" />

          {/* Neck */}
          <rect x="44" y="54" width="12" height="15" rx="3" fill="#eac2a4" />

          {/* Ears & Head */}
          <circle cx="31" cy="43" r="5" fill="#eac2a4" />
          <circle cx="69" cy="43" r="5" fill="#eac2a4" />
          <ellipse cx="50" cy="43" rx="19" ry="21" fill="#f5ceb3" />

          {/* Dignified Silver Hair */}
          <path
            d="M31 42C31 25 39 18 50 18C61 18 69 25 69 42C67 29 59 23 50 23C41 23 33 29 31 42Z"
            fill="#94a3b8"
          />
          <path d="M30 40C30 35 34 32 37 32" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
          <path d="M70 40C70 35 66 32 63 32" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />

          {/* Gentle Eyes & Crow's Feet */}
          <ellipse cx="42" cy="41" rx="2.5" ry="2" fill="#1e293b" />
          <ellipse cx="58" cy="41" rx="2.5" ry="2" fill="#1e293b" />
          <path d="M35 41L37 42" stroke="#b68968" strokeWidth="1.2" />
          <path d="M65 41L63 42" stroke="#b68968" strokeWidth="1.2" />

          {/* Silver Eyebrows */}
          <path d="M37 35C40 34 44 35 46 36" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M54 36C56 35 60 34 63 35" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" />

          {/* Nose & Warm Smile */}
          <path d="M50 42V48L48 49" stroke="#b68968" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M43 53C45 57 55 57 57 53" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" fill="#ffffff" />
        </svg>
      );

    // ----------------------------------------------------
    // 4. Omar (Young Active Male): Sporty, AV fistula wrap
    // ----------------------------------------------------
    case 'male_young_1':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#ffedd5" stroke="#f97316" strokeWidth="2.5" />

          {/* Sporty Warm Orange Hoodie/Track Top */}
          <path d="M20 90C20 74 32 66 50 66C68 66 80 74 80 90" fill="#ea580c" />
          <path d="M44 66L50 78L56 66" fill="#ffffff" />
          <path d="M50 78V90" stroke="#c2410c" strokeWidth="2" />

          {/* Clinical Attribute: Sporty AV Fistula Arm Wrap with Heart Beat Icon */}
          <rect x="70" y="74" width="16" height="12" rx="4" fill="#ffffff" stroke="#c2410c" strokeWidth="1.8" />
          <path d="M73 80L76 77L78 83L80 78L83 80" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Neck */}
          <rect x="44" y="54" width="12" height="15" rx="3" fill="#fed7aa" />

          {/* Ears & Head */}
          <circle cx="31" cy="42" r="5" fill="#fed7aa" />
          <circle cx="69" cy="42" r="5" fill="#fed7aa" />
          <ellipse cx="50" cy="42" rx="19" ry="21" fill="#fcd9bd" />

          {/* Modern Textured Hair */}
          <path
            d="M31 36C31 21 40 16 50 16C60 16 69 21 69 36C69 27 63 20 50 20C38 20 31 27 31 36Z"
            fill="#18181b"
          />
          <path d="M40 18L44 24L48 19L53 25L58 19" stroke="#3f3f46" strokeWidth="2" strokeLinecap="round" />

          {/* Energetic Bright Eyes */}
          <circle cx="42" cy="39" r="3" fill="#18181b" />
          <circle cx="43" cy="38" r="1.2" fill="#ffffff" />
          <circle cx="58" cy="39" r="3" fill="#18181b" />
          <circle cx="59" cy="38" r="1.2" fill="#ffffff" />

          {/* Eyebrows */}
          <path d="M37 33C40 31 44 32 46 34" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M54 34C56 32 60 31 63 33" stroke="#18181b" strokeWidth="2.5" strokeLinecap="round" />

          {/* Nose & Big Cheerful Smile */}
          <path d="M50 41V46H48" stroke="#d49b78" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M41 49C44 56 56 56 59 49" stroke="#b91c1c" strokeWidth="2.2" strokeLinecap="round" fill="#ffffff" />
          <circle cx="37" cy="47" r="3" fill="#f43f5e" opacity="0.3" />
          <circle cx="63" cy="47" r="3" fill="#f43f5e" opacity="0.3" />
        </svg>
      );

    // ----------------------------------------------------
    // 5. Fatima (Mature Female): Teal Hijab, AV fistula bandage
    // ----------------------------------------------------
    case 'female_mature_1':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#ccfbf1" stroke="#0d9488" strokeWidth="2.5" />

          {/* Elegant Teal Hijab Background Drape */}
          <path
            d="M26 40C26 23 37 16 50 16C63 16 74 23 74 40C74 58 72 74 76 90H24C28 74 26 58 26 40Z"
            fill="#0f766e"
          />

          {/* Torso: Dark Teal Abaya/Dress */}
          <path d="M22 90C22 75 33 68 50 68C67 68 78 75 78 90" fill="#115e59" />

          {/* Clinical Attribute: AV Fistula Dressing on Right visual arm */}
          <rect x="68" y="75" width="16" height="12" rx="4" fill="#ffffff" stroke="#0f766e" strokeWidth="1.8" />
          <path d="M71 81H81" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M76 77V85" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />

          {/* Face Oval framed by Hijab */}
          <ellipse cx="50" cy="46" rx="16" ry="18" fill="#fed7aa" />

          {/* Hijab Inner Edge & Forehead Band */}
          <path
            d="M34 46C34 32 40 26 50 26C60 26 66 32 66 46C66 58 59 62 50 62C41 62 34 58 34 46Z"
            fill="#0f766e"
            fillOpacity="0.08"
          />
          <path d="M37 36C42 30 58 30 63 36" stroke="#14b8a6" strokeWidth="2.5" strokeLinecap="round" />

          {/* Kind Warm Eyes */}
          <ellipse cx="43" cy="43" rx="2.8" ry="3.2" fill="#1e293b" />
          <circle cx="44" cy="42" r="1.2" fill="#ffffff" />
          <ellipse cx="57" cy="43" rx="2.8" ry="3.2" fill="#1e293b" />
          <circle cx="58" cy="42" r="1.2" fill="#ffffff" />

          {/* Curved Gentle Eyebrows */}
          <path d="M38 37C41 35 45 36 47 38" stroke="#115e59" strokeWidth="2" strokeLinecap="round" />
          <path d="M53 38C55 36 59 35 62 37" stroke="#115e59" strokeWidth="2" strokeLinecap="round" />

          {/* Nose & Warm Gentle Smile */}
          <path d="M50 44V49H48" stroke="#d49b78" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M43 53C45 57 55 57 57 53" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round" fill="#ffffff" />
          <circle cx="39" cy="50" r="3" fill="#f43f5e" opacity="0.35" />
          <circle cx="61" cy="50" r="3" fill="#f43f5e" opacity="0.35" />
        </svg>
      );

    // ----------------------------------------------------
    // 6. Maryam (Female Mature): Rose Headscarf, Permcath chest
    // ----------------------------------------------------
    case 'female_mature_2':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#ffe4e6" stroke="#f43f5e" strokeWidth="2.5" />

          {/* Soft Rose Scarf Drape */}
          <path
            d="M26 40C26 23 37 16 50 16C63 16 74 23 74 40C74 58 72 74 76 90H24C28 74 26 58 26 40Z"
            fill="#e11d48"
          />

          {/* Torso: Burgundy/Rose Dress */}
          <path d="M22 90C22 75 33 68 50 68C67 68 78 75 78 90" fill="#9f1239" />

          {/* Clinical Attribute: Permcath Dual Lumen Catheter Dressing on Chest */}
          <rect x="58" y="70" width="16" height="14" rx="3" fill="#ffffff" stroke="#f43f5e" strokeWidth="1.5" />
          <circle cx="62" cy="80" r="2" fill="#ef4444" />
          <circle cx="68" cy="80" r="2" fill="#3b82f6" />

          {/* Face Oval */}
          <ellipse cx="50" cy="46" rx="16" ry="18" fill="#fcd9bd" />

          {/* Inner Scarf Trim */}
          <path d="M37 35C42 30 58 30 63 35" stroke="#fbcfe8" strokeWidth="2.5" strokeLinecap="round" />

          {/* Expressive Kind Eyes */}
          <ellipse cx="43" cy="43" rx="2.5" ry="3" fill="#3f3f46" />
          <circle cx="44" cy="42" r="1" fill="#ffffff" />
          <ellipse cx="57" cy="43" rx="2.5" ry="3" fill="#3f3f46" />
          <circle cx="58" cy="42" r="1" fill="#ffffff" />

          {/* Eyebrows */}
          <path d="M38 37C41 35 45 36 47 38" stroke="#881337" strokeWidth="2" strokeLinecap="round" />
          <path d="M53 38C55 36 59 35 62 37" stroke="#881337" strokeWidth="2" strokeLinecap="round" />

          {/* Nose & Smile */}
          <path d="M50 44V49L48 50" stroke="#d49b78" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M44 54C46 58 54 58 56 54" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" fill="#ffffff" />
          <circle cx="39" cy="50" r="2.8" fill="#f43f5e" opacity="0.4" />
          <circle cx="61" cy="50" r="2.8" fill="#f43f5e" opacity="0.4" />
        </svg>
      );

    // ----------------------------------------------------
    // 7. Zeinab (Female Elder): Traditional White Veil, AV fistula
    // ----------------------------------------------------
    case 'female_elder_1':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#eff6ff" stroke="#3b82f6" strokeWidth="2.5" />

          {/* Traditional White Veil / Scarf */}
          <path
            d="M26 39C26 22 37 15 50 15C63 15 74 22 74 39C74 58 72 74 76 90H24C28 74 26 58 26 39Z"
            fill="#f8fafc"
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />

          {/* Torso: Royal Blue Dress */}
          <path d="M22 90C22 75 33 68 50 68C67 68 78 75 78 90" fill="#1d4ed8" />

          {/* Clinical Attribute: AV Fistula Bandage on Forearm */}
          <rect x="16" y="75" width="16" height="12" rx="4" fill="#ffffff" stroke="#1d4ed8" strokeWidth="1.8" />
          <path d="M19 81H29" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M24 77V85" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />

          {/* Face Oval */}
          <ellipse cx="50" cy="46" rx="16" ry="18" fill="#fbd5b5" />

          {/* Soft Elder Lines & Warm Eyes */}
          <ellipse cx="43" cy="43" rx="2.5" ry="2" fill="#1e293b" />
          <ellipse cx="57" cy="43" rx="2.5" ry="2" fill="#1e293b" />
          <path d="M36 43L38 44" stroke="#c49774" strokeWidth="1" />
          <path d="M64 43L62 44" stroke="#c49774" strokeWidth="1" />

          {/* Gentle Grey Eyebrows */}
          <path d="M38 37C41 36 45 37 47 38" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M53 38C55 37 59 36 62 37" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />

          {/* Nose & Peaceful Smile */}
          <path d="M50 44V49L48 50" stroke="#c49774" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M43 54C45 58 55 58 57 54" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" fill="#ffffff" />
        </svg>
      );

    // ----------------------------------------------------
    // 8. Salma (Young Female): Lavender Scarf, AV fistula wrap
    // ----------------------------------------------------
    case 'female_young_1':
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#f5f3ff" stroke="#8b5cf6" strokeWidth="2.5" />

          {/* Modern Lavender Scarf Drape */}
          <path
            d="M26 39C26 22 37 15 50 15C63 15 74 22 74 39C74 58 72 74 76 90H24C28 74 26 58 26 39Z"
            fill="#7c3aed"
          />

          {/* Torso: Purple/Lavender Tunic */}
          <path d="M22 90C22 75 33 68 50 68C67 68 78 75 78 90" fill="#5b21b6" />

          {/* Clinical Attribute: AV Fistula Bandage on Right Arm */}
          <rect x="68" y="75" width="16" height="12" rx="4" fill="#ffffff" stroke="#7c3aed" strokeWidth="1.8" />
          <path d="M71 81H81" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="76" cy="81" r="2" fill="#10b981" />

          {/* Face Oval */}
          <ellipse cx="50" cy="45" rx="16" ry="18" fill="#fed7aa" />

          {/* Inner Hijab Trim */}
          <path d="M37 34C42 28 58 28 63 34" stroke="#ddd6fe" strokeWidth="2.5" strokeLinecap="round" />

          {/* Bright Cheerful Eyes */}
          <circle cx="43" cy="42" r="3" fill="#18181b" />
          <circle cx="44" cy="41" r="1.2" fill="#ffffff" />
          <circle cx="57" cy="42" r="3" fill="#18181b" />
          <circle cx="58" cy="41" r="1.2" fill="#ffffff" />

          {/* Eyebrows */}
          <path d="M38 36C41 34 45 35 47 37" stroke="#4c1d95" strokeWidth="2" strokeLinecap="round" />
          <path d="M53 37C55 35 59 34 62 36" stroke="#4c1d95" strokeWidth="2" strokeLinecap="round" />

          {/* Nose & Big Cheerful Smile */}
          <path d="M50 43V48H48" stroke="#d49b78" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M42 51C45 58 55 58 58 51" stroke="#b91c1c" strokeWidth="2.2" strokeLinecap="round" fill="#ffffff" />
          <circle cx="38" cy="49" r="3" fill="#f43f5e" opacity="0.4" />
          <circle cx="62" cy="49" r="3" fill="#f43f5e" opacity="0.4" />
        </svg>
      );

    default:
      // Fallback matching preset
      return (
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
          <circle cx="50" cy="50" r="48" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="2" />
          <circle cx="50" cy="42" r="18" fill="#fed7aa" />
          <path d="M24 88C24 74 36 66 50 66C64 66 76 74 76 88" fill="#1e6bb8" />
        </svg>
      );
  }
}
