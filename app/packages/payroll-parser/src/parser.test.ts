import { describe, expect, it } from 'vitest';
import { findCodiciFiscali, pageHasName, splitPayroll, type KnownEmployee } from './index';

const marco: KnownEmployee = { memberId: 'm-marco', codiceFiscale: 'CLMMRC88M03D612C' };
const anna: KnownEmployee = { memberId: 'm-anna', codiceFiscale: 'GLLNNA95S48A944C' };
const employer = '01234567897';

// Synthetic page texts shaped like Zucchetti / TeamSystem cedolini.
const page = (cf: string, extra = '') =>
  `OFFICINE AURORA S.R.L. P.IVA ${employer} CEDOLINO OTTOBRE 2026\nCOD. FISCALE ${cf} ${extra}\nNETTO IN BUSTA 1.734,00`;

describe('findCodiciFiscali', () => {
  it('finds valid codes, also when pdf.js splits them across text items', () => {
    expect(findCodiciFiscali('C.F.: clmmrc88m03d612c')).toEqual(['CLMMRC88M03D612C']);
    expect(findCodiciFiscali('Codice fiscale CLMMRC88 M03D612C')).toEqual(['CLMMRC88M03D612C']);
  });

  it('ignores look-alikes with a wrong check character', () => {
    expect(findCodiciFiscali('CLMMRC88M03D612D')).toEqual([]);
  });
});

describe('splitPayroll', () => {
  it('groups pages per employee, including continuation pages without a CF', () => {
    const result = splitPayroll(
      [page(marco.codiceFiscale), 'DETTAGLIO RITENUTE (segue)', page(anna.codiceFiscale)],
      [marco, anna],
      { employerCodes: [employer] },
    );
    expect(result.issues).toEqual([]);
    expect(result.documents).toEqual([
      { memberId: 'm-marco', codiceFiscale: marco.codiceFiscale, pages: [1, 2], continuationPages: [2], pagesWithoutName: [] },
      { memberId: 'm-anna', codiceFiscale: anna.codiceFiscale, pages: [3], continuationPages: [], pagesWithoutName: [] },
    ]);
  });

  it('reports pages it cannot assign safely instead of guessing', () => {
    const stranger = 'RSSMRA85T10A562S';
    const result = splitPayroll(
      [
        'COPERTINA RIEPILOGO',
        page(marco.codiceFiscale, `e ${anna.codiceFiscale}`),
        page(stranger),
        'segue',
      ],
      [marco, anna],
    );
    expect(result.documents).toEqual([]);
    expect(result.issues).toEqual([
      { page: 1, kind: 'unassigned' },
      { page: 2, kind: 'ambiguous', codiciFiscali: [marco.codiceFiscale, anna.codiceFiscale] },
      { page: 3, kind: 'unknown_employee', codiciFiscali: [stranger] },
      { page: 4, kind: 'unassigned' },
    ]);
  });

  it('never treats the employer code as an employee', () => {
    const soleTrader = 'RSSMRA85T10A562S'; // ditta individuale: the employer has a personal CF
    const result = splitPayroll([page(marco.codiceFiscale, `Datore ${soleTrader}`)], [marco], {
      employerCodes: [soleTrader],
    });
    expect(result.documents.map((d) => d.pages)).toEqual([[1]]);
  });

  it('can require a CF on every page', () => {
    const result = splitPayroll([page(marco.codiceFiscale), 'segue'], [marco], { continuationPages: false });
    expect(result.issues).toEqual([{ page: 2, kind: 'unassigned' }]);
  });
});

describe('name cross-check', () => {
  const marcoN: KnownEmployee = { ...marco, fullName: 'Marco Colombo' };
  const annaN: KnownEmployee = { ...anna, fullName: 'Anna Galli' };

  it('finds the name in any order, ignoring case, accents and glued words', () => {
    expect(pageHasName('DIPENDENTE: COLOMBO MARCO', 'Marco Colombo')).toBe(true);
    expect(pageHasName('Sig. Nicolo De Santis', 'Nicolò De Santis')).toBe(true);
    expect(pageHasName('COLOMBOMARCO', 'Marco Colombo')).toBe(true);
    expect(pageHasName('DIPENDENTE: COLOMBO LUCA', 'Marco Colombo')).toBe(false);
  });

  it('flags a continuation page that carries another person’s name', () => {
    // Page 2 has no readable CF but is Anna's payslip: it must not slip into Marco's silently.
    const result = splitPayroll(
      [page(marcoN.codiceFiscale, 'COLOMBO MARCO'), 'CEDOLINO GALLI ANNA (CF illeggibile)', page(annaN.codiceFiscale, 'GALLI ANNA')],
      [marcoN, annaN],
      { employerCodes: [employer] },
    );
    const marcoDoc = result.documents.find((d) => d.memberId === 'm-marco')!;
    expect(marcoDoc.continuationPages).toEqual([2]);
    expect(marcoDoc.pagesWithoutName).toEqual([2]);
    expect(result.documents.find((d) => d.memberId === 'm-anna')!.pagesWithoutName).toEqual([]);
  });

  it('flags a matched page without the registered name (wrong CF typed in Fide?)', () => {
    const result = splitPayroll([page(marcoN.codiceFiscale, 'BIANCHI PAOLO')], [marcoN], { employerCodes: [employer] });
    expect(result.documents[0]!.pagesWithoutName).toEqual([1]);
  });
});
