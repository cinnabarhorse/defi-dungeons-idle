'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseAsString, useQueryStates } from 'nuqs';
import { Check, CheckCircle2, ExternalLink } from 'lucide-react';
import { parseUnits, formatUnits } from 'viem';
import { useActiveAccount, useActiveWallet } from 'thirdweb/react';
import {
  getContract,
  prepareContractCall,
  readContract,
  sendTransaction,
  waitForReceipt,
} from 'thirdweb';
import { base } from 'thirdweb/chains';
import { Button } from '../ui/Button';
import { Card, CardContent, CardFooter, CardHeader } from '../ui/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import type { TokenSymbol } from '../../types/topup';
import {
  AMOUNT_MAX,
  AMOUNT_MIN,
  BASE_CHAIN_ID,
  DEADLINE_WINDOW_SECONDS,
  GAMEPOINTS_CONTRACT_ADDRESS,
  TOKENS,
  getTokenMetadata,
} from '../../lib/topup/constants';
import {
  formatAmount,
  formatTxHash,
  getExplorerTxUrl,
} from '../../lib/topup/format';
import {
  clampAmount,
  getAmountError,
  isValidAmount,
} from '../../lib/topup/validation';
import { useSession } from '../providers/SessionProvider';
import { thirdwebClient } from '../../lib/web3/config';
import {
  fetchTopupQuote,
  createPendingDeposit,
  fetchDeposits,
} from '../../lib/topup/api';
import { ERC20_ABI, GAMEPOINTS_ABI } from '../../lib/topup/abi';
import { TopupHistoryDialog } from './topup-history-dialog';
import { toBigInt } from '../../lib/topup/bigint';
import { waitForDepositCredit } from '../../lib/topup/credit-watch';
import { dispatchTopupDepositCredited } from '../../lib/topup/events';
import {
  buildInitialTopupQueryUpdate,
  resolveTopupTokenFromQuery,
} from '../../lib/topup/query';

const TOKEN_OPTIONS: TokenSymbol[] = TOKENS.map((token) => token.symbol);

interface SubmissionFeedback {
  type: 'success' | 'error';
  message: string;
}

interface SuccessDetails {
  amount: number;
  token: TokenSymbol;
  txHash: string;
}

export interface TopupFormProps {
  initialToken?: TokenSymbol;
  initialAmount?: number;
  showHistoryTrigger?: boolean;
}

export function TopupForm({
  initialToken,
  initialAmount,
  showHistoryTrigger = true,
}: TopupFormProps) {
  const [{ token: tokenParam, amount: amountParam }, setTopupQuery] =
    useQueryStates(
      {
        token: parseAsString.withDefault('USDC'),
        amount: parseAsString.withDefault(''),
      },
      {
        history: 'replace',
        clearOnDefault: false,
      }
    );

  const token = useMemo<TokenSymbol>(() => {
    return resolveTopupTokenFromQuery(tokenParam);
  }, [tokenParam]);

  const { hasValidSession } = useSession();
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const amountInputRef = useRef<HTMLInputElement>(null);
  const hasAppliedInitialValues = useRef(false);
  const lastInitialToken = useRef<TokenSymbol | null>(null);
  const pendingCreditChecks = useRef<Set<string>>(new Set());

  // Auto-renew disabled - feature not currently in use
  const [autoRenew] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<SubmissionFeedback | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successDetails, setSuccessDetails] = useState<SuccessDetails | null>(
    null
  );
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  const amountInput = amountParam ?? '';
  const amountNumber = Number.parseFloat(amountInput);
  const hasAmountInput = amountInput.trim().length > 0;
  const amountError = hasAmountInput ? getAmountError(amountNumber) : null;
  const amountValid = hasAmountInput && isValidAmount(amountNumber);

  const stakedAmount = amountValid ? Math.floor(amountNumber) : 0;

  useEffect(() => {
    if (initialToken && lastInitialToken.current !== initialToken) {
      hasAppliedInitialValues.current = false;
      lastInitialToken.current = initialToken;
    }
  }, [initialToken]);

  useEffect(() => {
    if (hasAppliedInitialValues.current) return;
    if (!initialToken && initialAmount == null) return;

    const update = buildInitialTopupQueryUpdate({
      initialToken,
      initialAmount,
      tokenParam,
      amountParam,
    });
    if (update) {
      void setTopupQuery(update);
    }

    hasAppliedInitialValues.current = true;
    lastInitialToken.current = initialToken ?? lastInitialToken.current;
  }, [
    initialToken,
    initialAmount,
    tokenParam,
    amountParam,
    setTopupQuery,
  ]);

  // Check if balance is insufficient
  const hasInsufficientBalance = useMemo(() => {
    if (!amountValid || !tokenBalance || isLoadingBalance) return false;
    const balanceNumber = Number.parseFloat(tokenBalance);
    if (Number.isNaN(balanceNumber)) return false;
    const amountFloored = Math.floor(amountNumber);
    // If balance is 0 or less, and amount is > 0, it's insufficient
    if (balanceNumber <= 0) return amountFloored > 0;
    return balanceNumber < amountFloored;
  }, [amountValid, tokenBalance, isLoadingBalance, amountNumber]);

  const ctaTitle = hasInsufficientBalance
    ? `Not enough ${token}`
    : stakedAmount > 0
      ? `Stake ${formatAmount(stakedAmount, token)} ${token}`
      : 'Stake';

  const handleTokenChange = useCallback(
    (value: string) => {
      if (value === token) return;
      if (value !== 'USDC' && value !== 'GHO' && value !== 'GHST') return;
      setFeedback(null);
      setSuccessDetails(null);
      void setTopupQuery({ token: value });
    },
    [setTopupQuery, token]
  );

  const handleAmountChange = useCallback(
    (value: string) => {
      setFeedback(null);
      setSuccessDetails(null);
      void setTopupQuery({ amount: value.length > 0 ? value : null });
    },
    [setTopupQuery]
  );

  const handleAmountBlur = useCallback(() => {
    if (!hasAmountInput) return;
    const clamped = clampAmount(amountNumber);
    const floored = Math.floor(clamped);
    if (!Number.isNaN(floored) && floored !== amountNumber) {
      void setTopupQuery({ amount: floored.toString() });
    }
  }, [amountNumber, hasAmountInput, setTopupQuery]);

  const fetchBalance = useCallback(async () => {
    if (!activeAccount || !hasValidSession) {
      setTokenBalance(null);
      return;
    }

    setIsLoadingBalance(true);
    try {
      const tokenMeta = getTokenMetadata(token);
      const tokenContract = getContract({
        client: thirdwebClient,
        chain: base,
        address: tokenMeta.address,
        abi: ERC20_ABI,
      });

      const balanceResult = await readContract({
        contract: tokenContract,
        method: 'balanceOf',
        params: [activeAccount.address],
      });

      const balanceWei = toBigInt(balanceResult);
      const balanceDecimal = formatUnits(balanceWei, tokenMeta.decimals);
      setTokenBalance(balanceDecimal);
    } catch (error) {
      console.error('Failed to fetch token balance', error);
      setTokenBalance(null);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [token, activeAccount, hasValidSession]);

  const startCreditWatch = useCallback(
    (txHash: string, watchedToken: TokenSymbol) => {
      const normalizedTxHash = txHash.trim().toLowerCase();
      if (!normalizedTxHash) {
        return;
      }
      if (pendingCreditChecks.current.has(normalizedTxHash)) {
        return;
      }
      pendingCreditChecks.current.add(normalizedTxHash);

      void (async () => {
        try {
          const credited = await waitForDepositCredit({
            txHash: normalizedTxHash,
            fetchDeposits,
          });
          if (credited) {
            dispatchTopupDepositCredited({
              txHash: normalizedTxHash,
              token: watchedToken,
            });
          }
        } finally {
          pendingCreditChecks.current.delete(normalizedTxHash);
        }
      })();
    },
    []
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (isSubmitting) return;

      if (!amountValid) {
        setFeedback({
          type: 'error',
          message: amountError ?? 'Enter a valid amount before minting.',
        });
        return;
      }

      setIsSubmitting(true);
      setFeedback(null);
      setStatusMessage(null);
      setSuccessDetails(null);

      try {
        if (!hasValidSession) {
          throw new Error('Connect your wallet before depositing.');
        }

        const account = activeAccount;
        if (!account) {
          throw new Error('Wallet connection unavailable. Please reconnect.');
        }

        const wallet = activeWallet;
        if (!wallet) {
          throw new Error('Wallet connection unavailable. Please reconnect.');
        }

        let chain = wallet.getChain();
        if (!chain || chain.id !== BASE_CHAIN_ID) {
          setStatusMessage('Switching to Base network…');
          await wallet.switchChain(base);
          chain = wallet.getChain();
          if (!chain || chain.id !== BASE_CHAIN_ID) {
            throw new Error('Please switch to Base network to top up.');
          }
        }

        const tokenMeta = getTokenMetadata(token);
        const amountString = amountInput.trim();
        const amountFloored = Math.floor(Number.parseFloat(amountString) || 0);
        let amountWei: bigint;
        try {
          amountWei = parseUnits(amountFloored.toString(), tokenMeta.decimals);
        } catch (error) {
          console.error('Failed to parse amount', error);
          throw new Error(
            'Failed to parse the amount. Enter a valid decimal number.'
          );
        }

        if (amountWei <= 0n) {
          throw new Error('Amount must be greater than zero.');
        }

        const amountDecimal = amountFloored.toString();

        setStatusMessage('Fetching quote…');
        const quote = await fetchTopupQuote({
          token,
          amountWei: amountWei.toString(),
        });

        if (
          quote.tokenAddress.toLowerCase() !== tokenMeta.address.toLowerCase()
        ) {
          throw new Error('Received quote for unexpected token. Try again.');
        }

        const tokenContract = getContract({
          client: thirdwebClient,
          chain: base,
          address: tokenMeta.address,
          abi: ERC20_ABI,
        });

        setStatusMessage('Checking allowance…');
        const allowanceResult = await readContract({
          contract: tokenContract,
          method: 'allowance',
          params: [account.address, GAMEPOINTS_CONTRACT_ADDRESS],
        });
        let allowance: bigint;
        try {
          allowance = toBigInt(allowanceResult);
        } catch (error) {
          console.error('Failed to parse allowance', error);
          allowance = 0n;
        }

        if (allowance < amountWei) {
          setStatusMessage('Approving token…');
          const approveTx = await prepareContractCall({
            contract: tokenContract,
            method: 'approve',
            params: [GAMEPOINTS_CONTRACT_ADDRESS, amountWei],
          });
          const approveResult = await sendTransaction({
            account,
            transaction: approveTx,
          });
          await waitForReceipt({
            client: thirdwebClient,
            chain: base,
            transactionHash: approveResult.transactionHash,
          });

          setStatusMessage('Verifying approval…');
          // Wait for allowance to propagate to avoid simulation failure
          let retries = 10;
          while (retries > 0) {
            const currentAllowance = await readContract({
              contract: tokenContract,
              method: 'allowance',
              params: [account.address, GAMEPOINTS_CONTRACT_ADDRESS],
            });
            if (toBigInt(currentAllowance) >= amountWei) break;
            await new Promise((resolve) => setTimeout(resolve, 1000));
            retries--;
          }

          void fetchBalance();
        }

        const deadline = BigInt(
          Math.floor(Date.now() / 1000) + DEADLINE_WINDOW_SECONDS
        );
        const minAmountOut = toBigInt(quote.minAmountOut);

        const gamePointsContract = getContract({
          client: thirdwebClient,
          chain: base,
          address: GAMEPOINTS_CONTRACT_ADDRESS,
          abi: GAMEPOINTS_ABI,
        });

        setStatusMessage('Submitting deposit…');
        const depositTx = await prepareContractCall({
          contract: gamePointsContract,
          method: 'deposit',
          params: [
            tokenMeta.address,
            amountWei,
            minAmountOut,
            deadline,
            autoRenew,
          ],
        });

        const depositResult = await sendTransaction({
          account,
          transaction: depositTx,
        });

        setStatusMessage('Waiting for confirmation…');
        await waitForReceipt({
          client: thirdwebClient,
          chain: base,
          transactionHash: depositResult.transactionHash,
        });

        setStatusMessage('Saving pending deposit…');
        await createPendingDeposit({
          token,
          amountDecimal,
          amountWei: amountWei.toString(),
          txHash: depositResult.transactionHash,
          autoRenew,
          minAmountOut: minAmountOut.toString(),
        });

        setSuccessDetails({
          amount: amountFloored,
          token,
          txHash: depositResult.transactionHash,
        });
        setStatusMessage(null);
        void fetchBalance();
        startCreditWatch(depositResult.transactionHash, token);
      } catch (error) {
        console.error('Failed to submit top-up', error);
        const message =
          error instanceof Error ? error.message : 'Failed to submit top-up.';
        setFeedback({
          type: 'error',
          message,
        });
        setStatusMessage(null);
      } finally {
        setStatusMessage(null);
        setIsSubmitting(false);
      }
    },
    [
      amountInput,
      amountValid,
      amountError,
      autoRenew,
      hasValidSession,
      activeAccount,
      activeWallet,
      isSubmitting,
      stakedAmount,
      token,
      fetchBalance,
      startCreditWatch,
    ]
  );

  useEffect(() => {
    void fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    // Auto-select the input field when the popup opens
    // Use setTimeout to ensure the dialog is fully rendered
    const timeoutId = setTimeout(() => {
      if (amountInputRef.current) {
        amountInputRef.current.focus();
        amountInputRef.current.select();
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, []);

  const handleMaxClick = useCallback(() => {
    if (tokenBalance !== null && !isLoadingBalance) {
      const balanceNumber = Number.parseFloat(tokenBalance);
      if (!Number.isNaN(balanceNumber) && balanceNumber > 0) {
        // Use the minimum of balance and AMOUNT_MAX, rounded down
        const maxAmount = Math.floor(Math.min(balanceNumber, AMOUNT_MAX));
        void setTopupQuery({ amount: maxAmount.toString() });
        if (amountInputRef.current) {
          amountInputRef.current.focus();
          amountInputRef.current.select();
        }
      } else {
        // Reset to empty if balance is 0 or invalid
        void setTopupQuery({ amount: null });
        if (amountInputRef.current) {
          amountInputRef.current.focus();
          amountInputRef.current.select();
        }
      }
    } else {
      // Reset to empty if balance is unavailable or loading
      void setTopupQuery({ amount: null });
      if (amountInputRef.current) {
        amountInputRef.current.focus();
        amountInputRef.current.select();
      }
    }
  }, [setTopupQuery, tokenBalance, isLoadingBalance]);

  const amountHint = amountError
    ? amountError
    : `Enter an amount between ${AMOUNT_MIN} and ${AMOUNT_MAX}.`;

  return (
    <section className="space-y-4">
      <Card className="border-0 shadow-none">
        <form onSubmit={handleSubmit} noValidate>
          {showHistoryTrigger ? (
            <CardHeader className="flex-row items-center justify-end gap-2 p-0 pb-4">
              <TopupHistoryDialog />
            </CardHeader>
          ) : null}
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="topup-token">Token</Label>
                <Select value={token} onValueChange={handleTokenChange}>
                  <SelectTrigger id="topup-token" aria-label="Select token">
                    <SelectValue placeholder="Select token" />
                  </SelectTrigger>
                  <SelectContent>
                    {TOKEN_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasValidSession && activeAccount && (
                  <p className="text-xs text-muted-foreground">
                    {isLoadingBalance ? (
                      'Loading balance…'
                    ) : tokenBalance !== null ? (
                      <>
                        Balance:{' '}
                        <button
                          type="button"
                          onClick={handleMaxClick}
                          className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
                        >
                          {Number.parseFloat(tokenBalance).toLocaleString(
                            'en-US',
                            {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 6,
                            }
                          )}{' '}
                          {token}
                        </button>
                      </>
                    ) : (
                      'Balance unavailable'
                    )}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="topup-amount">Amount ( 1 - 1000 )</Label>
                <div className="relative">
                  <Input
                    ref={amountInputRef}
                    id="topup-amount"
                    type="text"
                    inputMode="decimal"
                    value={amountInput}
                    placeholder="1-1000"
                    onChange={(event) =>
                      handleAmountChange(event.target.value.replace(',', '.'))
                    }
                    onBlur={handleAmountBlur}
                    aria-describedby="topup-amount-hint"
                    className="pr-16"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleMaxClick}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 text-xs px-2"
                  >
                    Max
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="topup-network">Network</Label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                    <img
                      src="/logos/base.jpeg"
                      alt="Base"
                      className="w-5 h-5 rounded"
                    />
                  </div>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                    <Check className="w-5 h-5 text-green-500" />
                  </div>
                  <Input
                    id="topup-network"
                    value="Base"
                    readOnly
                    disabled
                    className="pl-10 pr-10 w-full"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="topup-stake">Stake amount</Label>
                <Input
                  id="topup-stake"
                  value={formatAmount(stakedAmount, token)}
                  readOnly
                  disabled
                  className="text-right font-semibold"
                />
              </div>
            </div>

            {/* Auto-renew checkbox removed - feature not currently in use */}
          </CardContent>

          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button
              type="submit"
              disabled={
                !amountValid ||
                isSubmitting ||
                hasInsufficientBalance ||
                isLoadingBalance
              }
              className="h-auto w-full flex-col items-center gap-1 rounded-lg bg-primary px-4 py-3"
            >
              <div className="text-lg font-semibold">{ctaTitle}</div>
            </Button>

            {statusMessage ? (
              <p className="text-xs text-muted-foreground">{statusMessage}</p>
            ) : null}

            {feedback?.type === 'error' ? (
              <p
                className="text-sm text-destructive"
              >
                {feedback.message}
              </p>
            ) : null}

            {successDetails ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  </span>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-emerald-100">
                      Deposit received!
                    </p>
                    <p className="text-sm text-emerald-200/90">
                      {formatAmount(successDetails.amount, successDetails.token)}{' '}
                      {successDetails.token} is now pending. It will appear in
                      your history after confirmations.
                    </p>
                    <div className="flex items-center gap-2 text-xs text-emerald-200/80">
                      <span>{formatTxHash(successDetails.txHash)}</span>
                      <a
                        href={getExplorerTxUrl(
                          successDetails.txHash,
                          BASE_CHAIN_ID
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-100 hover:text-white"
                      >
                        View on Basescan
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

          </CardFooter>
        </form>
      </Card>
    </section>
  );
}
