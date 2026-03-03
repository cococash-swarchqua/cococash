import * as accountService from "../src/services/account.service";
import * as accountRepository from "../src/repositories/account.repository";

jest.mock("../src/repositories/account.repository");

describe("account.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should create account with initial balance", async () => {
    const mockAccount = {
      id: "uuid",
      user_id: "user-uuid",
      balance: 1000,
    };

    (accountRepository.insertAccount as jest.Mock).mockResolvedValue(mockAccount);

    const result = await accountService.createAccount("user-uuid", 1000);

    expect(result.balance).toBe(1000);
    expect(accountRepository.insertAccount).toHaveBeenCalled();
  });

  it("should throw error if balance negative", async () => {
    await expect(
      accountService.createAccount("user-uuid", -100)
    ).rejects.toThrow();
  });
});