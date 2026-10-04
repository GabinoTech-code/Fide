import { UserProfile, PunchRecord, AbsenceRequest } from '../types';
import { SupportedLanguage } from '../i18n';

interface AssistantContext {
  user: UserProfile;
  clockedIn: boolean;
  elapsedSeconds: number;
  punches: PunchRecord[];
  requests: AbsenceRequest[];
  language?: SupportedLanguage;
}

export function generateAssistantResponse(
  prompt: string,
  context: AssistantContext
): { text: string; actionCategory?: 'vac' | 'per' | 'olv' | 'ext' } {
  const p = prompt.toLowerCase().trim();
  const lang = context.language || 'it';
  const remainingVacation = Math.max(0, context.user.vacationQuotaDays - context.user.vacationUsedDays);
  const remainingPermits = Math.max(0, context.user.permitQuotaHours - context.user.permitUsedHours);

  // 1. Vacation / Ferie / Concediu / إجازة / Pushime / Відпустка / Congés / 年假
  if (
    p.includes('ferie') ||
    p.includes('vacaci') ||
    p.includes('vacation') ||
    p.includes('concediu') ||
    p.includes('إجاز') ||
    p.includes('pushim') ||
    p.includes('відпуст') ||
    p.includes('congé') ||
    p.includes('年假') ||
    p.includes('restan') ||
    p.includes('quedan')
  ) {
    const responses: Record<SupportedLanguage, string> = {
      it: `Ti restano ${remainingVacation} giorni lavorativi di ferie (ne hai usufruito di ${context.user.vacationUsedDays} su un totale di ${context.user.vacationQuotaDays}). Puoi inviare una richiesta formale nella sezione Richieste o direttamente da qui.`,
      es: `Te quedan ${remainingVacation} días laborables de vacaciones (has disfrutado ${context.user.vacationUsedDays} de un total de ${context.user.vacationQuotaDays}). Si deseas solicitar días, puedes hacerlo desde la pestaña de Solicitudes o directamente aquí.`,
      en: `You have ${remainingVacation} working days of vacation remaining (used ${context.user.vacationUsedDays} out of ${context.user.vacationQuotaDays}). You can submit a request under the Requests tab or directly here.`,
      ro: `Mai ai ${remainingVacation} zile lucrătoare de concediu rămase (ai utilizat ${context.user.vacationUsedDays} din totalul de ${context.user.vacationQuotaDays}). Poți trimite o cerere în secțiunea Cereri sau direct de aici.`,
      ar: `لديك ${remainingVacation} يوماً متبقياً من الإجازة السنوية (استهلكت ${context.user.vacationUsedDays} من أصل ${context.user.vacationQuotaDays}). يمكنك تقديم طلب إجازة عبر تبويب الطلبات أو هنا مباشرة.`,
      sq: `Keni edhe ${remainingVacation} ditë pushimi të mbetura (keni përdorur ${context.user.vacationUsedDays} nga ${context.user.vacationQuotaDays} gjithsej). Mund të dërgoni një kërkesë te seksioni Kërkesat ose direkt këtu.`,
      uk: `У вас залишилося ${remainingVacation} робочих днів відпустки (використано ${context.user.vacationUsedDays} із ${context.user.vacationQuotaDays}). Ви можете подати запит у розділі Запити або прямо тут.`,
      fr: `Il vous reste ${remainingVacation} jours ouvrés de congés (vous avez utilisé ${context.user.vacationUsedDays} sur un total de ${context.user.vacationQuotaDays}). Vous pouvez déposer une demande dans l'onglet Demandes ou directement ici.`,
      zh: `您还有 ${remainingVacation} 天带薪年假可用（已休 ${context.user.vacationUsedDays} 天，总额度 ${context.user.vacationQuotaDays} 天）。您可以在“申请”栏目或在此处直接发起休假申请。`,
    };

    return {
      text: responses[lang] || responses.it,
      actionCategory: 'vac',
    };
  }

  // 2. Permits / Permessi / Ore / Permisie / أذونات / Відгули / 事假
  if (
    p.includes('permess') ||
    p.includes('permiso') ||
    p.includes('permit') ||
    p.includes('permis') ||
    p.includes('إذن') ||
    p.includes('leje') ||
    p.includes('відгул') ||
    p.includes('autorisation') ||
    p.includes('事假') ||
    p.includes('medico') ||
    p.includes('médic')
  ) {
    const responses: Record<SupportedLanguage, string> = {
      it: `Hai ${remainingPermits} ore disponibili nel tuo monte permessi retribuiti (ROL / ex festività). Per visite mediche o impegni personali, puoi richiedere il permesso con l'orario stimato.`,
      es: `Dispones de ${remainingPermits} horas disponibles en tu bolsa de permisos retribuidos. Para ausencias por consulta médica o asuntos propios, registra la solicitud con el horario estimado.`,
      en: `You have ${remainingPermits} hours available in your paid permit quota. For medical appointments or personal matters, you can submit a permit with your planned schedule.`,
      ro: `Ai ${remainingPermits} ore disponibile în cota de permisii plătite. Pentru programări medicale sau motive personale, poți solicita permisia cu intervalul orar estimat.`,
      ar: `لديك ${remainingPermits} ساعة متاحة في رصيد أذونات الغياب المدفوعة. للمواعيد الطبية أو الظروف الخاصة، يمكنك تسجيل طلب الإذن مع تحديد الساعات.`,
      sq: `Keni ${remainingPermits} orë të lira në kuotën e lejeve të paguara. Për vizita mjekësore ose çështje personale, mund të kërkoni leje me orarin e planifikuar.`,
      uk: `У вас є ${remainingPermits} доступних годин оплачуваних відгулів. Для візитів до лікаря або особистих справ ви можете оформити запит із вказанням годин.`,
      fr: `Vous disposez de ${remainingPermits} heures d'autorisation d'absence rémunérée. Pour des rendez-vous médicaux ou motifs personnels, vous pouvez poser une demande.`,
      zh: `您的带薪事假/就医时假余额为 ${remainingPermits} 小时。如需外出就医或办理个人事务，可提交预估时段的请假申请。`,
    };

    return {
      text: responses[lang] || responses.it,
      actionCategory: 'per',
    };
  }

  // 3. Shift / Turno / Timbratura / Fichar / Clock / Pontaj / تسجيل / Orar / 班次
  if (
    p.includes('turno') ||
    p.includes('timbr') ||
    p.includes('fichar') ||
    p.includes('clock') ||
    p.includes('pont') ||
    p.includes('ورد') ||
    p.includes('hyrj') ||
    p.includes('змін') ||
    p.includes('point') ||
    p.includes('打卡') ||
    p.includes('班次') ||
    p.includes('stato') ||
    p.includes('orario')
  ) {
    if (context.clockedIn) {
      const hours = Math.floor(context.elapsedSeconds / 3600);
      const minutes = Math.floor((context.elapsedSeconds % 3600) / 60);

      const inResponses: Record<SupportedLanguage, string> = {
        it: `La tua sessione di lavoro è attiva. Tempo registrato oggi: ${hours} h ${minutes} min (orario previsto: ${context.user.shiftSchedule}). Ricordati di timbrare l'uscita al termine del turno.`,
        es: `Tu jornada se encuentra activa. Llevas registrado un tiempo de ${hours} h ${minutes} min en tu sesión actual (horario: ${context.user.shiftSchedule}). Recuerda registrar la salida al concluir.`,
        en: `Your work shift is active. Elapsed time: ${hours} h ${minutes} min (schedule: ${context.user.shiftSchedule}). Remember to clock out when you finish.`,
        ro: `Tura ta de lucru este activă. Timp lucrat înregistrat: ${hours} h ${minutes} min (program: ${context.user.shiftSchedule}). Nu uita să pontezi ieșirea la final.`,
        ar: `فترة عملك قيد التسجيل حالياً. الوقت المسجل: ${hours} س و ${minutes} د (الجدول: ${context.user.shiftSchedule}). تذكر تسجيل الخروج عند انتهاء الوردية.`,
        sq: `Turni yt i punës është aktiv. Koha e regjistruar: ${hours} h ${minutes} min (orari: ${context.user.shiftSchedule}). Mos harro të regjistrosh daljen në fund.`,
        uk: `Ваша робоча зміна активна. Зафіксовано часу: ${hours} год ${minutes} хв (графік: ${context.user.shiftSchedule}). Не забудьте відмітити завершення зміни.`,
        fr: `Votre poste est en cours. Temps écoulé : ${hours} h ${minutes} min (horaires : ${context.user.shiftSchedule}). N'oubliez pas de badger la sortie à la fin.`,
        zh: `您当前处于在岗打卡状态。本次在岗时长：${hours}小时${minutes}分钟（所属班次：${context.user.shiftSchedule}）。下班时请记得打卡。`,
      };

      return { text: inResponses[lang] || inResponses.it };
    } else {
      const outResponses: Record<SupportedLanguage, string> = {
        it: `Attualmente non risulti in servizio. Il tuo orario di riferimento è ${context.user.shiftSchedule}. Puoi registrare la presenza nella schermata 'Timbra' con geofence, QR o NFC.`,
        es: `Actualmente no constas en jornada activa. Tu turno habitual es ${context.user.shiftSchedule}. Puedes fichar en la pantalla 'Fichar' con geovalla, QR o NFC.`,
        en: `You are currently clocked out. Your scheduled shift is ${context.user.shiftSchedule}. You can clock in under the 'Clock' tab using geofence, QR, or NFC.`,
        ro: `În prezent nu ești pontat. Tura ta obișnuită este ${context.user.shiftSchedule}. Poți ponta intrarea în secțiunea 'Pontaj' prin geofence, QR sau NFC.`,
        ar: `أنت خارج وقت الوردية حالياً. جدول عملك المعتاد هو ${context.user.shiftSchedule}. يمكنك تسجيل الدخول من تبويب 'تسجيل الحضور' عبر السياج الجغرافي أو QR أو NFC.`,
        sq: `Aktualisht nuk jeni i regjistruar në punë. Turni juaj i zakonshëm është ${context.user.shiftSchedule}. Mund të regjistroheni te 'Regjistrohu' me geofence, QR ose NFC.`,
        uk: `Наразі зміну не розпочато. Ваш звичайний графік: ${context.user.shiftSchedule}. Почати зміну можна на вкладці 'Облік часу' через геозону, QR або NFC.`,
        fr: `Vous n'avez pas encore pointé. Vos horaires habituels sont ${context.user.shiftSchedule}. Vous pouvez pointer dans l'onglet 'Pointer' via géorepérage, QR ou NFC.`,
        zh: `您当前未在岗。您的标准考勤班次为 ${context.user.shiftSchedule}。您可以在“打卡”页面通过电子围栏、二维码或NFC进行上班打卡。`,
      };

      return { text: outResponses[lang] || outResponses.it };
    }
  }

  // 4. Payslip / Busta paga / Nómina / Fluturaș / راتب / Rrogë / Зарплата / 工资
  if (
    p.includes('busta') ||
    p.includes('paga') ||
    p.includes('stipendio') ||
    p.includes('nómina') ||
    p.includes('payslip') ||
    p.includes('salary') ||
    p.includes('flutura') ||
    p.includes('راتب') ||
    p.includes('rrog') ||
    p.includes('зарплат') ||
    p.includes('paie') ||
    p.includes('工资')
  ) {
    const payResponses: Record<SupportedLanguage, string> = {
      it: `I tuoi cedolini paga e le certificazioni uniche sono custoditi con cifratura asimmetrica (libsodium) nella sezione 'Documenti'. Solo tu e l'emittente aziendale potete decifrarli sul dispositivo.`,
      es: `Tus nóminas y certificados se custodian cifrados de extremo a extremo en 'Documentos'. Solo tú y el emisor autorizado podéis descifrarlos en este móvil.`,
      en: `Your payslips and tax forms are end-to-end encrypted (libsodium) in the 'Docs' section. Only authorized payroll staff and you can decrypt them on this device.`,
      ro: `Fluturașii de salariu și documentele fiscale sunt stocate criptat end-to-end (libsodium) în secțiunea 'Documente'. Doar tu și emitentul le puteți decripta pe acest telefon.`,
      ar: `كشوف رواتبك وشهاداتك الضريبية محفوظة بتشفير تام (libsodium) في قسم 'المستندات'. أنت والجهة المصدرة المعتمدة فقط من يملك مفتاح فك التشفير.`,
      sq: `Fletëpagesat dhe certifikatat ruhen me enkriptim fund-më-fund (libsodium) te 'Dokumentet'. Vetëm ti dhe punëdhënësi mund t'i hapni në këtë telefon.`,
      uk: `Ваші зарплатні відомості та довідки надійно зашифровані (libsodium) у розділі 'Документи'. Доступ до розшифрування маєте лише ви та працедавець.`,
      fr: `Vos bulletins de paie et attestations fiscales sont chiffrés de bout en bout (libsodium) dans 'Documents'. Seuls l'émetteur et vous pouvez les déchiffrer sur ce mobile.`,
      zh: `您的月度工资单和年度纳税证明在“文件”栏目中受到非对称端到端加密保护（libsodium）。仅发件机构与您本机私钥可解密查看。`,
    };

    return { text: payResponses[lang] || payResponses.it };
  }

  // 5. Privacy / GDPR / Dati / Geolocalizzazione / بيانات / Конфіденційність / 隐私
  if (
    p.includes('priva') ||
    p.includes('gdpr') ||
    p.includes('rgpd') ||
    p.includes('dati') ||
    p.includes('datos') ||
    p.includes('gps') ||
    p.includes('geoloc') ||
    p.includes('بيان') ||
    p.includes('خصوص') ||
    p.includes('конфіден') ||
    p.includes('données') ||
    p.includes('隐私')
  ) {
    const privResponses: Record<SupportedLanguage, string> = {
      it: `Fide applica la massima conformità GDPR (Privacy by Design). Il controllo geofence avviene esclusivamente in locale sul tuo smartphone: all'azienda arriva solo l'esito "in sede: sì/no", mai il tracciamento continuo delle coordinate GPS. Le chiavi crittografiche non lasciano mai il telefono.`,
      es: `En Fide, tu privacidad está protegida por diseño (Privacy by Design). La comprobación de geovalla se efectúa en tu propio dispositivo: a la empresa solo llega "dentro de sede: sí/no", jamás tus coordenadas continuas. Tus claves nunca salen del móvil.`,
      en: `Fide implements Privacy by Design under strict GDPR compliance. Geofence checks happen exclusively on your device: the company only receives "on premises: yes/no", never your live GPS tracking. Cryptographic keys never leave your phone.`,
      ro: `Fide respectă cu strictețe normele GDPR (Privacy by Design). Verificarea locației se face doar pe telefonul tău: compania primește doar „în sediu: da/nu”, niciodată coordonatele tale GPS în timp real. Cheile private nu părăsesc dispozitivul.`,
      ar: `نظام Fide يعتمد مبدأ الخصوصية بالتصميم وفقاً للائحة العامة لحماية البيانات (GDPR). فحص الموقع يتم محلياً على هاتفك فقط، وتتلقى الشركة إشارة نعم/لا دون معرفة إحداثيات GPS إطلاقاً. المفاتيح المشفرة لا تغادر هاتفك.`,
      sq: `Fide zbaton rregullat më të rrepta të GDPR (Privacy by Design). Kontrolli i vendndodhjes bëhet vetëm brenda telefonit tuaj: kompania merr vetëm "në seli: po/jo", kurrë koordinatat e vazhdueshme GPS. Çelësat privatë nuk dalin kurrë nga pajisja.`,
      uk: `Fide забезпечує суворий захист приватності згідно з GDPR (Privacy by Design). Перевірка геозони відбувається виключно локально на вашому телефоні: компанія отримує лише статус «на місці: так/ні» без передачі GPS-координат. Ключі ніколи не залишають пристрій.`,
      fr: `Fide respecte le RGPD dès la conception (Privacy by Design). La vérification de présence s'effectue localement sur votre mobile : l'entreprise reçoit uniquement "sur site : oui/non", jamais votre position GPS continue. Vos clés privées restent sur votre appareil.`,
      zh: `Fide严格遵循欧盟通用数据保护条例（GDPR）的“从设计阶段融入隐私”（Privacy by Design）原则。考勤电子围栏仅在手机本地运算：企业端只接收“是否在场：是/否”，绝不上传或追踪连续GPS轨迹。私钥永不离机。`,
    };

    return { text: privResponses[lang] || privResponses.it };
  }

  // Fallback tailored greeting
  const fallbacks: Record<SupportedLanguage, string> = {
    it: `Ricevuto, ${context.user.name}. Come assistente aziendale in ${context.user.company}, posso aiutarti a verificare le ferie residue (${remainingVacation} giorni), i permessi (${remainingPermits} h), lo stato delle timbrature o le tutele della privacy. Come posso esserti utile?`,
    es: `Entendido, ${context.user.name}. Como asistente de ${context.user.company}, puedo ayudarte a gestionar tus vacaciones (${remainingVacation} días), consultar permisos (${remainingPermits} h), verificar tus fichajes o resolver dudas sobre nóminas y privacidad. ¿En qué más puedo apoyarte?`,
    en: `Understood, ${context.user.name}. As your HR assistant at ${context.user.company}, I can help you check vacation balances (${remainingVacation} days), permit hours (${remainingPermits} h), shift clock status or privacy policies. How can I assist you?`,
    ro: `Am înțeles, ${context.user.name}. În calitate de asistent la ${context.user.company}, te pot ajuta cu balanța de concediu (${remainingVacation} zile), permisii (${remainingPermits} ore), pontaje sau confidențialitate. Cu ce te pot ajuta?`,
    ar: `مرحباً ${context.user.name}. بصفتي المساعد المعتمد في ${context.user.company}، يمكنني مساعدتك في رصيد الإجازات (${remainingVacation} يوماً)، الأذونات (${remainingPermits} ساعة)، حالة الحضور وسياسات الخصوصية. كيف يمكنني خدمتك؟`,
    sq: `E kuptova, ${context.user.name}. Si asistent në ${context.user.company}, mund t'ju ndihmoj për pushimet (${remainingVacation} ditë), lejet (${remainingPermits} orë), regjistrimin e turneve ose privatësinë. Me çfarë mund t'ju ndihmoj?`,
    uk: `Зрозуміло, ${context.user.name}. Як HR-помічник у ${context.user.company}, я можу допомогти вам із залишком відпустки (${remainingVacation} дн.), відгулами (${remainingPermits} год), обліком робочого часу чи безпекою даних. Чим можу допомогти?`,
    fr: `Bien reçu, ${context.user.name}. En tant qu'assistant RH chez ${context.user.company}, je peux vous aider à consulter vos congés (${remainingVacation} jours), autorisations (${remainingPermits} h), pointages ou règles de confidentialité. Comment puis-je vous aider ?`,
    zh: `收到，${context.user.name}。作为 ${context.user.company} 的智能人事助手，我可以协助您查询可用年假（${remainingVacation}天）、事假余额（${remainingPermits}小时）、考勤打卡状态或数据主权保护政策。请问还有什么我可以协助您的？`,
  };

  return {
    text: fallbacks[lang] || fallbacks.it,
  };
}
