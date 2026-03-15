/**
 * Bitrix24 API და ველების კონფიგურაცია ლისტი 82-ისთვის
 * საჭიროების შემთხვევაში შეცვალეთ ველების სახელები API-ის პასუხის მიხედვით
 */
module.exports = {
  // API ბაზა (webhook)
  apiBase: 'https://crm.archi.ge/rest/1/0g8qitmb87y5jl7g',
  method: 'lists.element.get',

  // ლისტი 82
  listId: 82,

  // გვერდზე ჩანაწერების რაოდენობა (Bitrix24 ლიმიტი)
  pageSize: 50,

  // დაყოვნება მოთხოვნებს შორის (ms) - რომ API არ გაჭედოს
  delayBetweenRequestsMs: 400,

  /**
   * ველების მაპინგი: API-ში დაბრუნებული სახელი -> ჩვენი ლოგიკა
   * პირველი გაშვების შემდეგ შეამოწმეთ console-ში result[0] და შეცვალეთ keys
   */
  fields: {
    project: 'PROPERTY_1472',      // პროექტი (შეიძლება იყოს PROPERTY_XXX ან სხვა)
    floorFrom: 'PROPERTY_1474',    // სართული-დან
    floorTo: 'PROPERTY_1476',      // სართული-მდე
    responsible: 'PROPERTY_1478',  // პასუხისმგებელი (მენეჯერი)
  },
};
